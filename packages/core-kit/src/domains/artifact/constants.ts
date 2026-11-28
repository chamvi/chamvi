/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

/** A media type an artifact may carry: RFC 6838 restricted names, `type/subtype` without parameters. */
export const ARTIFACT_MEDIA_TYPE_PATTERN = /^[a-z0-9][\w!#$&^.+-]{0,126}\/[a-z0-9][\w!#$&^.+-]{0,126}$/i;

/** The most attachments of one `POST /agents/{name}/runs`. */
export const MAX_ATTACHMENTS = 16;

/** The longest attachment filename. */
export const ATTACHMENT_FILENAME_MAX_LENGTH = 255;
