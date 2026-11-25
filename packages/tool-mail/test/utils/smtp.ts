/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import net from 'node:net';
import type { AddressInfo } from 'node:net';

export type FakeSmtpOptions = {
    /** Answers every AUTH with 535. */
    authFails?: boolean;
    /** Commands matching it get no reply. */
    hold?: RegExp;
    /** RCPT TO addresses matching it are refused with 550. */
    rejectRecipient?: RegExp;
};

export type FakeSmtpMessage = {
    from: string;
    to: string[];
    /** The DATA bytes as received, dot-unstuffed, without the final `.` line. */
    raw: string;
};

export type FakeSmtp = {
    port: number;
    /** The command names (`EHLO`, `AUTH PLAIN`, `MAIL FROM`, `RCPT TO`, `DATA`, ...), never a credential. */
    commands: string[];
    messages: FakeSmtpMessage[];
    close: () => Promise<void>;
};

/** The text a refusal carries; a client must never repeat it. */
export const SMTP_SERVER_TEXT = 'secret-server-text';

function addressOf(line: string): string {
    const match = /<([^>]*)>/.exec(line);

    return match ? match[1]! : line.slice(line.indexOf(':') + 1).trim();
}

function nameOf(line: string): string {
    const upper = line.toUpperCase();

    if (upper.startsWith('MAIL FROM')) {
        return 'MAIL FROM';
    }

    if (upper.startsWith('RCPT TO')) {
        return 'RCPT TO';
    }

    const [verb = '', mechanism = ''] = line.split(' ');

    return verb.toUpperCase() === 'AUTH' ? `AUTH ${mechanism.toUpperCase()}` : verb.toUpperCase();
}

/** An in-process plain-text ESMTP server on 127.0.0.1; records command names and the messages it accepts. */
export async function createFakeSmtp(options: FakeSmtpOptions = {}): Promise<FakeSmtp> {
    const commands: string[] = [];
    const messages: FakeSmtpMessage[] = [];
    const sockets = new Set<net.Socket>();

    const server = net.createServer((socket) => {
        sockets.add(socket);
        socket.on('close', () => sockets.delete(socket));
        socket.on('error', () => undefined);

        let buffer = Buffer.alloc(0);
        let from = '';
        let to: string[] = [];
        let data: string[] | undefined;
        // credential lines still to come after an AUTH
        let credentials = 0;
        const write = (value: string) => {
            if (!socket.destroyed) {
                socket.write(value);
            }
        };
        const authenticated = () => write(options.authFails ?
            `535 5.7.8 ${SMTP_SERVER_TEXT} rejected the login\r\n` :
            '235 2.7.0 accepted\r\n');

        write('220 fake ESMTP ready\r\n');

        socket.on('data', (chunk: Buffer) => {
            buffer = Buffer.concat([buffer, chunk]);

            let index = buffer.indexOf('\r\n');

            while (index !== -1) {
                const line = buffer.subarray(0, index).toString('utf8');

                buffer = buffer.subarray(index + 2);
                index = buffer.indexOf('\r\n');

                if (data) {
                    if (line === '.') {
                        messages.push({
                            from, 
                            to, 
                            raw: data.map((entry) => `${entry}\r\n`).join(''), 
                        });
                        data = undefined;
                        write('250 2.0.0 queued\r\n');
                    } else {
                        data.push(line.startsWith('.') ? line.slice(1) : line);
                    }

                    continue;
                }

                if (credentials > 0) {
                    credentials--;

                    if (credentials > 0) {
                        write('334 UGFzc3dvcmQ6\r\n');
                    } else {
                        authenticated();
                    }

                    continue;
                }

                const name = nameOf(line);

                commands.push(name);

                if (options.hold?.test(line)) {
                    continue;
                }

                switch (name) {
                    case 'EHLO':
                        write('250-fake\r\n250-AUTH PLAIN LOGIN\r\n250 8BITMIME\r\n');

                        break;
                    case 'AUTH PLAIN':
                        if (line.split(' ').length > 2) {
                            authenticated();
                        } else {
                            credentials = 1;
                            write('334 \r\n');
                        }

                        break;
                    case 'AUTH LOGIN':
                        credentials = line.split(' ').length > 2 ? 1 : 2;
                        write(credentials === 2 ? '334 VXNlcm5hbWU6\r\n' : '334 UGFzc3dvcmQ6\r\n');

                        break;
                    case 'MAIL FROM':
                        from = addressOf(line);
                        to = [];
                        write('250 2.1.0 ok\r\n');

                        break;
                    case 'RCPT TO': {
                        const address = addressOf(line);

                        if (options.rejectRecipient?.test(address)) {
                            write(`550 5.1.1 ${SMTP_SERVER_TEXT} no such user\r\n`);
                        } else {
                            to.push(address);
                            write('250 2.1.5 ok\r\n');
                        }

                        break;
                    }
                    case 'DATA':
                        data = [];
                        write('354 go ahead\r\n');

                        break;
                    case 'RSET':
                        from = '';
                        to = [];
                        write('250 2.0.0 ok\r\n');

                        break;
                    case 'NOOP':
                        write('250 2.0.0 ok\r\n');

                        break;
                    case 'QUIT':
                        write('221 2.0.0 bye\r\n');
                        socket.end();

                        break;
                    default:
                        write('502 5.5.2 unknown command\r\n');
                }
            }
        });
    });

    await new Promise<void>((resolve) => {
        server.listen(0, '127.0.0.1', resolve);
    });

    return {
        port: (server.address() as AddressInfo).port,
        commands,
        messages,
        close: async () => {
            for (const socket of sockets) {
                socket.destroy();
            }

            await new Promise<void>((resolve) => {
                server.close(() => resolve());
            });
        },
    };
}
