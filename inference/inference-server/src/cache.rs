#![allow(dead_code)]

use rusqlite::{params, Connection, OptionalExtension, Result};
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

#[derive(Debug, Clone, PartialEq)]
pub struct EmbedCacheEntry {
    pub model: String,
    pub input_hash: String,
    pub dims: i64,
    pub vector: Vec<f32>,
    pub expires_at: i64,
}

#[derive(Debug, Clone, PartialEq)]
pub struct GenerateCacheEntry {
    pub model: String,
    pub prompt_hash: String,
    pub options_hash: String,
    pub text: String,
    pub tokens: i64,
    pub expires_at: i64,
}

#[derive(Debug, Clone, PartialEq)]
pub struct CacheStats {
    pub db_path: String,
    pub embed_rows: i64,
    pub gen_rows: i64,
}

pub struct CacheStore {
    conn: Connection,
    db_path: PathBuf,
}

impl CacheStore {
    pub fn open(path: impl AsRef<Path>) -> Result<Self> {
        let db_path = path.as_ref().to_path_buf();
        if let Some(parent) = db_path.parent() {
            let _ = std::fs::create_dir_all(parent);
        }
        let conn = Connection::open(&db_path)?;
        let store = Self { conn, db_path };
        store.init()?;
        Ok(store)
    }

    pub fn now_epoch_seconds() -> i64 {
        SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs() as i64
    }

    pub fn put_embed(&self, entry: &EmbedCacheEntry) -> Result<()> {
        let vector_json = serde_json::to_string(&entry.vector).map_err(json_error)?;
        self.conn.execute(
            r#"
            insert into embed_cache (model, input_hash, dims, vector_json, expires_at, created_at)
            values (?1, ?2, ?3, ?4, ?5, ?6)
            on conflict(model, input_hash) do update set
              dims = excluded.dims,
              vector_json = excluded.vector_json,
              expires_at = excluded.expires_at,
              created_at = excluded.created_at
            "#,
            params![
                entry.model,
                entry.input_hash,
                entry.dims,
                vector_json,
                entry.expires_at,
                Self::now_epoch_seconds(),
            ],
        )?;
        Ok(())
    }

    pub fn get_embed(&self, model: &str, input_hash: &str) -> Result<Option<EmbedCacheEntry>> {
        let now = Self::now_epoch_seconds();
        let row = self
            .conn
            .query_row(
                r#"
                select model, input_hash, dims, vector_json, expires_at
                from embed_cache
                where model = ?1 and input_hash = ?2 and expires_at > ?3
                "#,
                params![model, input_hash, now],
                |row| {
                    let vector_json: String = row.get(3)?;
                    let vector = serde_json::from_str(&vector_json).map_err(json_error)?;
                    Ok(EmbedCacheEntry {
                        model: row.get(0)?,
                        input_hash: row.get(1)?,
                        dims: row.get(2)?,
                        vector,
                        expires_at: row.get(4)?,
                    })
                },
            )
            .optional()?;
        if row.is_none() {
            self.conn.execute(
                "delete from embed_cache where model = ?1 and input_hash = ?2 and expires_at <= ?3",
                params![model, input_hash, now],
            )?;
        }
        Ok(row)
    }

    pub fn put_generate(&self, entry: &GenerateCacheEntry) -> Result<()> {
        self.conn.execute(
            r#"
            insert into generate_cache
              (model, prompt_hash, options_hash, text, tokens, expires_at, created_at)
            values (?1, ?2, ?3, ?4, ?5, ?6, ?7)
            on conflict(model, prompt_hash, options_hash) do update set
              text = excluded.text,
              tokens = excluded.tokens,
              expires_at = excluded.expires_at,
              created_at = excluded.created_at
            "#,
            params![
                entry.model,
                entry.prompt_hash,
                entry.options_hash,
                entry.text,
                entry.tokens,
                entry.expires_at,
                Self::now_epoch_seconds(),
            ],
        )?;
        Ok(())
    }

    pub fn get_generate(
        &self,
        model: &str,
        prompt_hash: &str,
        options_hash: &str,
    ) -> Result<Option<GenerateCacheEntry>> {
        let now = Self::now_epoch_seconds();
        let row = self
            .conn
            .query_row(
                r#"
                select model, prompt_hash, options_hash, text, tokens, expires_at
                from generate_cache
                where model = ?1 and prompt_hash = ?2 and options_hash = ?3 and expires_at > ?4
                "#,
                params![model, prompt_hash, options_hash, now],
                |row| {
                    Ok(GenerateCacheEntry {
                        model: row.get(0)?,
                        prompt_hash: row.get(1)?,
                        options_hash: row.get(2)?,
                        text: row.get(3)?,
                        tokens: row.get(4)?,
                        expires_at: row.get(5)?,
                    })
                },
            )
            .optional()?;
        if row.is_none() {
            self.conn.execute(
                r#"
                delete from generate_cache
                where model = ?1 and prompt_hash = ?2 and options_hash = ?3 and expires_at <= ?4
                "#,
                params![model, prompt_hash, options_hash, now],
            )?;
        }
        Ok(row)
    }

    pub fn stats(&self) -> Result<CacheStats> {
        let now = Self::now_epoch_seconds();
        let embed_rows = self.conn.query_row(
            "select count(*) from embed_cache where expires_at > ?1",
            params![now],
            |row| row.get(0),
        )?;
        let gen_rows = self.conn.query_row(
            "select count(*) from generate_cache where expires_at > ?1",
            params![now],
            |row| row.get(0),
        )?;
        Ok(CacheStats {
            db_path: self.db_path.to_string_lossy().to_string(),
            embed_rows,
            gen_rows,
        })
    }

    fn init(&self) -> Result<()> {
        self.conn.execute_batch(
            r#"
            create table if not exists embed_cache (
              model text not null,
              input_hash text not null,
              dims integer not null,
              vector_json text not null,
              expires_at integer not null,
              created_at integer not null,
              primary key (model, input_hash)
            );
            create index if not exists idx_embed_cache_expires_at
              on embed_cache (expires_at);

            create table if not exists generate_cache (
              model text not null,
              prompt_hash text not null,
              options_hash text not null,
              text text not null,
              tokens integer not null,
              expires_at integer not null,
              created_at integer not null,
              primary key (model, prompt_hash, options_hash)
            );
            create index if not exists idx_generate_cache_expires_at
              on generate_cache (expires_at);
            "#,
        )?;
        Ok(())
    }
}

fn json_error(error: serde_json::Error) -> rusqlite::Error {
    rusqlite::Error::ToSqlConversionFailure(Box::new(error))
}
