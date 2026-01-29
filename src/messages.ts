export const USER_HASH_REQUIRED         = () => 'A user hash is required for this operation.';
export const INVALID_FILE_PATH          = (path: string) => `Invalid file path "${path}"`;
export const INVALID_LITTERBOX_DURATION = (input: string, acceptedDurations: string[])=> `Invalid duration "${input}", accepted values are ${acceptedDurations.join(', ')}`;
