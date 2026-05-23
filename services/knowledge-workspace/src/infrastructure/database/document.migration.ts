import type { MigrationInterface, QueryRunner } from "typeorm";

export class KnowledgeDocuments1778623200004 implements MigrationInterface {
  name = "KnowledgeDocuments1778623200004";

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE fulcrum_doc_pages (
        id varchar(128) PRIMARY KEY,
        project_id varchar(128) NOT NULL REFERENCES fulcrum_projects(id) ON DELETE CASCADE,
        document_id varchar(128) NOT NULL REFERENCES fulcrum_documents(id) ON DELETE CASCADE,
        parent_page_id varchar(128) REFERENCES fulcrum_doc_pages(id) ON DELETE SET NULL,
        title varchar(320) NOT NULL,
        slug varchar(220) NOT NULL,
        icon varchar(80),
        position varchar(160) NOT NULL,
        body_md text NOT NULL,
        editor_json jsonb NOT NULL DEFAULT '{}'::jsonb,
        yjs_state text,
        trace_id varchar(160) NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT fulcrum_doc_pages_project_slug_key UNIQUE (project_id, slug)
      )
    `);
    await queryRunner.query(
      "CREATE INDEX fulcrum_doc_pages_project_parent_idx ON fulcrum_doc_pages (project_id, parent_page_id)",
    );
    await queryRunner.query(
      "CREATE INDEX fulcrum_doc_pages_trace_idx ON fulcrum_doc_pages (trace_id)",
    );

    await queryRunner.query(`
      CREATE TABLE fulcrum_doc_page_history (
        id varchar(128) PRIMARY KEY,
        page_id varchar(128) NOT NULL REFERENCES fulcrum_doc_pages(id) ON DELETE CASCADE,
        version int NOT NULL,
        title varchar(320) NOT NULL,
        body_md text NOT NULL,
        editor_json jsonb NOT NULL DEFAULT '{}'::jsonb,
        yjs_state text,
        contributor_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
        trace_id varchar(160) NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT fulcrum_doc_page_history_page_version_key UNIQUE (page_id, version)
      )
    `);

    await queryRunner.query(`
      CREATE TABLE fulcrum_doc_comments (
        id varchar(128) PRIMARY KEY,
        page_id varchar(128) NOT NULL REFERENCES fulcrum_doc_pages(id) ON DELETE CASCADE,
        parent_comment_id varchar(128) REFERENCES fulcrum_doc_comments(id) ON DELETE CASCADE,
        author_id varchar(128) NOT NULL,
        content jsonb NOT NULL DEFAULT '{}'::jsonb,
        selection jsonb,
        status varchar(80) NOT NULL,
        trace_id varchar(160) NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(
      "CREATE INDEX fulcrum_doc_comments_page_status_idx ON fulcrum_doc_comments (page_id, status)",
    );

    await queryRunner.query(`
      CREATE TABLE fulcrum_doc_attachments (
        id varchar(128) PRIMARY KEY,
        page_id varchar(128) NOT NULL REFERENCES fulcrum_doc_pages(id) ON DELETE CASCADE,
        file_name varchar(320) NOT NULL,
        mime_type varchar(160) NOT NULL,
        size_bytes bigint NOT NULL,
        storage_path text NOT NULL,
        checksum_sha256 varchar(80),
        trace_id varchar(160) NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(
      "CREATE INDEX fulcrum_doc_attachments_page_idx ON fulcrum_doc_attachments (page_id)",
    );

    await queryRunner.query(`
      CREATE TABLE fulcrum_doc_backlinks (
        id varchar(128) PRIMARY KEY,
        source_page_id varchar(128) NOT NULL REFERENCES fulcrum_doc_pages(id) ON DELETE CASCADE,
        target_page_id varchar(128) NOT NULL REFERENCES fulcrum_doc_pages(id) ON DELETE CASCADE,
        link_type varchar(80) NOT NULL,
        trace_id varchar(160) NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT fulcrum_doc_backlinks_unique_edge UNIQUE (source_page_id, target_page_id, link_type)
      )
    `);
    await queryRunner.query(
      "CREATE INDEX fulcrum_doc_backlinks_source_idx ON fulcrum_doc_backlinks (source_page_id)",
    );
    await queryRunner.query(
      "CREATE INDEX fulcrum_doc_backlinks_target_idx ON fulcrum_doc_backlinks (target_page_id)",
    );

    await queryRunner.query(`
      CREATE TABLE fulcrum_doc_collaboration_states (
        id varchar(128) PRIMARY KEY,
        page_id varchar(128) NOT NULL REFERENCES fulcrum_doc_pages(id) ON DELETE CASCADE,
        provider varchar(80) NOT NULL,
        state_vector text,
        document_state text,
        active_client_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
        trace_id varchar(160) NOT NULL,
        updated_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT fulcrum_doc_collaboration_states_page_provider_key UNIQUE (page_id, provider)
      )
    `);

    await queryRunner.query(`
      CREATE TABLE fulcrum_doc_search_entries (
        id varchar(128) PRIMARY KEY,
        page_id varchar(128) NOT NULL REFERENCES fulcrum_doc_pages(id) ON DELETE CASCADE,
        project_id varchar(128) NOT NULL REFERENCES fulcrum_projects(id) ON DELETE CASCADE,
        source_kind varchar(80) NOT NULL DEFAULT 'page',
        title varchar(320) NOT NULL,
        search_text text NOT NULL,
        excerpt text,
        trace_id varchar(160) NOT NULL,
        updated_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT fulcrum_doc_search_entries_page_key UNIQUE (page_id)
      )
    `);
    await queryRunner.query(
      "CREATE INDEX fulcrum_doc_search_entries_project_idx ON fulcrum_doc_search_entries (project_id)",
    );
    await queryRunner.query(
      "CREATE INDEX fulcrum_doc_search_entries_project_source_idx ON fulcrum_doc_search_entries (project_id, source_kind)",
    );

    await queryRunner.query(`
      CREATE TABLE fulcrum_saved_searches (
        id varchar(128) PRIMARY KEY,
        workspace_id varchar(128) NOT NULL REFERENCES fulcrum_workspaces(id) ON DELETE CASCADE,
        user_id varchar(128) NOT NULL,
        name varchar(220) NOT NULL,
        query_json jsonb NOT NULL DEFAULT '{}'::jsonb,
        scope varchar(80) NOT NULL,
        project_id varchar(128) REFERENCES fulcrum_projects(id) ON DELETE CASCADE,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(
      "CREATE INDEX fulcrum_saved_searches_workspace_user_idx ON fulcrum_saved_searches (workspace_id, user_id)",
    );
    await queryRunner.query(
      "CREATE INDEX fulcrum_saved_searches_workspace_scope_idx ON fulcrum_saved_searches (workspace_id, scope)",
    );

    await queryRunner.query(`
      CREATE TABLE fulcrum_search_clicks (
        id varchar(128) PRIMARY KEY,
        workspace_id varchar(128) NOT NULL REFERENCES fulcrum_workspaces(id) ON DELETE CASCADE,
        user_id varchar(128) NOT NULL,
        project_id varchar(128) REFERENCES fulcrum_projects(id) ON DELETE CASCADE,
        query text NOT NULL,
        result_id varchar(128) NOT NULL,
        result_kind varchar(80) NOT NULL,
        position integer,
        created_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(
      "CREATE INDEX fulcrum_search_clicks_workspace_user_idx ON fulcrum_search_clicks (workspace_id, user_id)",
    );
    await queryRunner.query(
      "CREATE INDEX fulcrum_search_clicks_workspace_project_idx ON fulcrum_search_clicks (workspace_id, project_id)",
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query("DROP TABLE IF EXISTS fulcrum_search_clicks");
    await queryRunner.query("DROP TABLE IF EXISTS fulcrum_saved_searches");
    await queryRunner.query("DROP TABLE IF EXISTS fulcrum_doc_search_entries");
    await queryRunner.query("DROP TABLE IF EXISTS fulcrum_doc_collaboration_states");
    await queryRunner.query("DROP TABLE IF EXISTS fulcrum_doc_backlinks");
    await queryRunner.query("DROP TABLE IF EXISTS fulcrum_doc_attachments");
    await queryRunner.query("DROP TABLE IF EXISTS fulcrum_doc_comments");
    await queryRunner.query("DROP TABLE IF EXISTS fulcrum_doc_page_history");
    await queryRunner.query("DROP TABLE IF EXISTS fulcrum_doc_pages");
  }
}
