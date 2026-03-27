import neo4j, {
  Driver,
  Session,
  Record as Neo4jRecord,
  Integer,
  isInt,
  Node as Neo4jNode,
  Relationship as Neo4jRelationship,
  Path as Neo4jPath,
} from 'neo4j-driver';

// ─────────────────────────────────────────────────────────────────────────────
// CONNECTION CONFIG
// ─────────────────────────────────────────────────────────────────────────────

const NEO4J_URI      = process.env['NEO4J_URI']      ?? 'bolt://localhost:7687';
const NEO4J_USER     = process.env['NEO4J_USER']     ?? 'neo4j';
const NEO4J_PASSWORD = process.env['NEO4J_PASSWORD'] ?? 'password';
const NEO4J_DATABASE = process.env['NEO4J_DATABASE'] ?? 'neo4j';

// ─────────────────────────────────────────────────────────────────────────────
// SINGLETON DRIVER
// ─────────────────────────────────────────────────────────────────────────────

let _driver: Driver | null = null;

/**
 * Returns (or lazily creates) the singleton Neo4j Driver.
 * The driver maintains an internal connection pool — reuse it across calls.
 */
export function getDriver(): Driver {
  if (!_driver) {
    // bolt:// URI → unencrypted by default in neo4j-driver v5.
    // Do NOT set `encrypted` or `trust` — both were removed in v5 and
    // cause "Connection was closed by server" on plain Bolt connections.
    _driver = neo4j.driver(
      NEO4J_URI,
      neo4j.auth.basic(NEO4J_USER, NEO4J_PASSWORD),
      { logging: neo4j.logging.console('warn') }
    );
  }
  return _driver;
}

/** Opens a new session against the configured database. */
export function getSession(): Session {
  return getDriver().session({ database: NEO4J_DATABASE });
}

/**
 * Gracefully shuts down the driver and clears the singleton.
 * Call this at the end of scripts / test teardown.
 */
export async function closeDriver(): Promise<void> {
  if (_driver) {
    await _driver.close();
    _driver = null;
  }
}

/**
 * Verifies the driver can reach Neo4j and that GDS is installed.
 * Retries up to `maxAttempts` times with a 5-second gap so callers do not
 * need to wait for the container to be fully healthy before running.
 *
 * Throws a clear error only after all retry attempts are exhausted.
 */
export async function verifyConnection(maxAttempts = 12): Promise<void> {
  let lastError = '';

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      // getDriver() creates the singleton; verifyConnectivity() opens a
      // test connection without running any query.
      await getDriver().verifyConnectivity();

      const rows = await runQuery<{ gdsVersion: string }>(
        'RETURN gds.version() AS gdsVersion'
      );
      const version = rows[0]?.gdsVersion ?? '(unknown)';
      console.log(`  ✔ Neo4j connected  — GDS version: ${version}`);
      return;                             // success — stop retrying
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);

      if (attempt < maxAttempts) {
        console.log(
          `  ⏳ Neo4j not ready yet (attempt ${attempt}/${maxAttempts}) — ` +
          `retrying in 5 s...`
        );
        // Reset driver so the next attempt opens a fresh connection
        await closeDriver();
        await new Promise((r) => setTimeout(r, 5_000));
      }
    }
  }

  throw new Error(
    `Cannot reach Neo4j at ${NEO4J_URI} after ${maxAttempts} attempts.\n` +
    `  Run: cd docker && docker-compose up -d\n` +
    `  Then wait ~60 s for GDS to finish downloading.\n` +
    `  Last error: ${lastError}`
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// INTEGER / VALUE CONVERSION
//
// Neo4j driver returns integer values as opaque Integer objects that break
// JSON.stringify and arithmetic.  toPlain() recursively converts the full
// result tree before returning it to callers.
// ─────────────────────────────────────────────────────────────────────────────

export function toPlain(value: unknown): unknown {
  // ── Neo4j Integer → JS number ────────────────────────────────────────────
  if (isInt(value)) {
    return (value as Integer).toNumber();
  }

  // ── Neo4j Node → plain object with properties + meta ────────────────────
  if (value instanceof Neo4jNode) {
    return {
      ...toPlainObject(value.properties as Record<string, unknown>),
      _neo4jId: (value.identity as Integer).toNumber(),
      _labels:  value.labels,
    };
  }

  // ── Neo4j Relationship → plain object ───────────────────────────────────
  if (value instanceof Neo4jRelationship) {
    return {
      ...toPlainObject(value.properties as Record<string, unknown>),
      _neo4jId: (value.identity as Integer).toNumber(),
      _type:    value.type,
      _from:    (value.start as Integer).toNumber(),
      _to:      (value.end   as Integer).toNumber(),
    };
  }

  // ── Neo4j Path → structured segment list ─────────────────────────────────
  if (value instanceof Neo4jPath) {
    return {
      start: toPlain(value.start),
      end:   toPlain(value.end),
      length: value.length,
      segments: value.segments.map((seg) => ({
        start:        toPlain(seg.start),
        relationship: toPlain(seg.relationship),
        end:          toPlain(seg.end),
      })),
    };
  }

  // ── Array ────────────────────────────────────────────────────────────────
  if (Array.isArray(value)) {
    return value.map(toPlain);
  }

  // ── Plain object ─────────────────────────────────────────────────────────
  if (value !== null && typeof value === 'object') {
    return toPlainObject(value as Record<string, unknown>);
  }

  // ── Primitive (string, boolean, null, number, undefined) ─────────────────
  return value;
}

function toPlainObject(obj: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    result[k] = toPlain(v);
  }
  return result;
}

// ─────────────────────────────────────────────────────────────────────────────
// runQuery — PRIMARY PUBLIC API
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Executes a Cypher query and returns rows as plain JS objects.
 *
 * • All neo4j.Integer values are converted to JS numbers.
 * • Neo4j Node / Relationship / Path objects are flattened.
 * • Execution time is logged to stdout.
 * • Any error is re-thrown with the query text for easy debugging.
 *
 * @param query  Cypher query string
 * @param params Query parameters (use $param placeholders in the query)
 */
export async function runQuery<T = Record<string, unknown>>(
  query: string,
  params: Record<string, unknown> = {}
): Promise<T[]> {
  const session = getSession();
  const start   = Date.now();

  try {
    const result  = await session.run(query, params);
    const elapsed = Date.now() - start;

    if (result.records.length > 0 || elapsed > 100) {
      // Only log when there are results or the query took a notable amount of time
      process.stdout.write(
        `  ⏱  ${elapsed}ms  (${result.records.length} records)\n`
      );
    }

    return result.records.map((record: Neo4jRecord) => {
      const row: Record<string, unknown> = {};
      for (const key of record.keys as string[]) {
        row[key] = toPlain(record.get(key));
      }
      return row as T;
    });
  } catch (err) {
    const msg   = err instanceof Error ? err.message : String(err);
    const snip  = query.trim().slice(0, 200).replace(/\s+/g, ' ');
    throw new Error(`Neo4j query failed: ${msg}\n  Query: ${snip}`);
  } finally {
    await session.close();
  }
}
