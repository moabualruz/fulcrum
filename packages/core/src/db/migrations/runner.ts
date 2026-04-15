import type Database from 'better-sqlite3'
import { runM001 } from './m001.js'
import { runM002 } from './m002.js'
import { runM003 } from './m003.js'
import { runM004 } from './m004.js'
import { runM005 } from './m005.js'
import { runM006 } from './m006.js'
import { runM007 } from './m007.js'
import { runM008 } from './m008.js'
import { runM009 } from './m009.js'
import { runM010 } from './m010.js'
import { runM011 } from './m011.js'
import { runM012 } from './m012.js'
import { runM013 } from './m013.js'
import { runM014 } from './m014.js'
import { runM015 } from './m015.js'
import { runM016 } from './m016.js'
import { runM017 } from './m017.js'
import { runM018 } from './m018.js'
import { runM019 } from './m019.js'
import { runM020 } from './m020.js'
import { runM021 } from './m021.js'
import { runM022 } from './m022.js'
import { runM023 } from './m023.js'
import { runM024 } from './m024.js'
import { runM025 } from './m025.js'
import { runM026 } from './m026.js'
import { runM027 } from './m027.js'
import { runM028 } from './m028.js'
import { runM029 } from './m029.js'
import { runM030 } from './m030.js'
import { runM031 } from './m031.js'
import { runM032b } from './m032b.js'
import { runM032c } from './m032c.js'
import { runM032 } from './m032.js'
import { runM033 } from './m033.js'
import { runM034 } from './m034.js'
import { runM035 } from './m035.js'
import { runM036 } from './m036.js'
import { runM037 } from './m037.js'
import { runM038 } from './m038.js'
import { runM039 } from './m039.js'
import { runM040 } from './m040.js'
import { runM041 } from './m041.js'
import { runM042 } from './m042.js'
import { runM043 } from './m043.js'
import { runM044 } from './m044.js'
import { runM045 } from './m045.js'
import { runM046 } from './m046.js'
import { runM047 } from './m047.js'
import { runM048 } from './m048.js'
import { runM049 } from './m049.js'
import { runM050 } from './m050.js'
import { runM051 } from './m051.js'
import { runM052 } from './m052.js'

export function runMigrations(db: Database.Database): void {
  runM001(db)
  runM002(db)
  runM003(db)

  // Optional vector table — degrades gracefully if sqlite-vec not available
  try {
    db.exec(`CREATE VIRTUAL TABLE IF NOT EXISTS vec_memories USING vec0(embedding float[1024])`)
  } catch {
    // sqlite-vec not available
  }

  runM004(db)
  runM005(db)

  // Optional vec_chunks (requires sqlite-vec)
  try {
    db.exec(`CREATE VIRTUAL TABLE IF NOT EXISTS vec_chunks USING vec0(embedding float[1024])`)
  } catch {
    // sqlite-vec not available
  }

  runM006(db)
  runM007(db)
  runM008(db)
  runM009(db)
  runM010(db)
  runM011(db)
  runM012(db)
  runM013(db)
  runM014(db)
  runM015(db)
  runM016(db)
  runM017(db)
  runM018(db)
  runM019(db)
  runM020(db)
  runM021(db)

  // Migrations 022-027 are idempotent via schema_migrations table (same as
  // m028+). Run them unconditionally — each self-guards against re-application.
  // The old early-return pattern was a bug: it caused m028–m048 to be silently
  // skipped on any database upgraded past m022 (CORE-003).
  runM022(db)
  runM023(db)
  runM024(db)
  runM025(db)
  runM026(db)
  runM027(db)

  runM028(db)
  runM029(db)
  runM030(db)
  runM031(db)
  runM032b(db)
  runM032c(db)
  runM032(db)
  runM033(db)
  runM034(db)
  runM035(db)
  runM036(db)
  runM037(db)
  runM038(db)
  runM039(db)
  runM040(db)
  runM041(db)
  runM042(db)
  runM043(db)
  runM044(db)
  runM045(db)
  runM046(db)
  runM047(db)
  runM048(db)
  runM049(db)
  runM050(db)
  runM051(db)
  runM052(db)
}
