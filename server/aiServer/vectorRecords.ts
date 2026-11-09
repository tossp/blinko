import { createClient } from '@libsql/client';
import { VECTOR_DB_FILE_PATH } from '@shared/lib/sharedConstant';

/** Preserve legacy single-record deletion without reaching into Mastra's private client. */
export async function deleteVectorRecord(targetId: number, url = VECTOR_DB_FILE_PATH) {
  const client = createClient({ url });
  try {
    const result = await client.execute({
      sql: `WITH target_record AS (
        SELECT vector_id FROM 'blinko' WHERE metadata->>'id' = ? LIMIT 1
      )
      DELETE FROM 'blinko'
      WHERE vector_id IN (SELECT vector_id FROM target_record)
      RETURNING *;`,
      args: [targetId],
    });
    if (result.rows.length === 0) throw new Error(`id  ${targetId} is not found`);
    return { success: true, deletedData: result.rows[0] };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'unknown error' };
  } finally {
    client.close();
  }
}
