import { describe, expect, test, vi } from 'vitest';
import { runWithCleanup } from '../src/utils';

describe('runWithCleanup', () => {
	test('preserves a successful remote result when local cleanup fails', async () => {
		const cleanupError = new Error('cleanup failed');
		const warning = vi.spyOn(process, 'emitWarning').mockImplementation(() => undefined);

		try {
			await expect(runWithCleanup(
				async () => 'https://files.catbox.moe/success.png',
				async () => { throw cleanupError; }
			)).resolves.toBe('https://files.catbox.moe/success.png');
			expect(warning).toHaveBeenCalledOnce();
			const emittedWarning = warning.mock.calls[0]?.[0];
			expect(emittedWarning).toMatchObject({
				message: 'Failed to clean up temporary upload files',
				code: 'NODE_CATBOX_TEMP_CLEANUP_FAILED',
				cause: cleanupError
			});
		} finally {
			warning.mockRestore();
		}
	});

	test('reports both the operation and cleanup errors', async () => {
		const operationError = new Error('operation failed');
		const cleanupError = new Error('cleanup failed');

		const result = runWithCleanup(
			async () => { throw operationError; },
			async () => { throw cleanupError; }
		);

		await expect(result).rejects.toMatchObject({
			errors: [operationError, cleanupError]
		});
	});
});
