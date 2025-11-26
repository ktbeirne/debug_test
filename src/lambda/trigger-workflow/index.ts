import { CloudWatchLogsEvent, Context } from 'aws-lambda';
import { Octokit } from '@octokit/rest';
import * as zlib from 'zlib';
import { promisify } from 'util';

const gunzip = promisify(zlib.gunzip);

/**
 * CloudWatch Logsからのイベントを受け取り、GitHub Actionsをトリガーする Lambda関数
 */

interface ErrorLogData {
    timestamp: string;
    message: string;
    error?: {
        name: string;
        message: string;
        stack?: string;
    };
    context?: string;
    severity?: string;
}

interface GitHubDispatchPayload {
    error_message: string;
    error_stack: string;
    error_type: string;
    timestamp: string;
    log_group: string;
    log_stream: string;
    context: string;
}

export const handler = async (
    event: CloudWatchLogsEvent,
    context: Context
): Promise<void> => {
    console.log('CloudWatch Logs event received:', JSON.stringify(event));

    try {
        // CloudWatch Logsのデータをデコード
        const payload = Buffer.from(event.awslogs.data, 'base64');
        const decompressed = await gunzip(payload);
        const logData = JSON.parse(decompressed.toString('utf-8'));

        console.log('Decompressed log data:', JSON.stringify(logData));

        // エラーログを抽出
        const errorLogs: ErrorLogData[] = [];

        for (const logEvent of logData.logEvents) {
            try {
                const parsedMessage = JSON.parse(logEvent.message);

                // ERRORレベルのログのみ処理
                if (parsedMessage.severity === 'ERROR' && parsedMessage.error) {
                    errorLogs.push(parsedMessage);
                }
            } catch (e) {
                // JSON以外のログメッセージはスキップ
                console.log('Skipping non-JSON log message:', logEvent.message);
            }
        }

        if (errorLogs.length === 0) {
            console.log('No error logs found, skipping GitHub Actions trigger');
            return;
        }

        // GitHub Actionsをトリガー
        const octokit = new Octokit({
            auth: process.env.GITHUB_TOKEN,
        });

        const owner = process.env.GITHUB_OWNER!;
        const repo = process.env.GITHUB_REPO!;

        // 各エラーログに対してGitHub Actionsをトリガー
        for (const errorLog of errorLogs) {
            const payload: GitHubDispatchPayload = {
                error_message: errorLog.error?.message || 'Unknown error',
                error_stack: errorLog.error?.stack || 'No stack trace available',
                error_type: errorLog.error?.name || 'Error',
                timestamp: errorLog.timestamp,
                log_group: logData.logGroup,
                log_stream: logData.logStream,
                context: errorLog.context || 'Unknown context',
            };

            console.log('Triggering GitHub Actions with payload:', JSON.stringify(payload));

            await octokit.repos.createDispatchEvent({
                owner,
                repo,
                event_type: 'error-detected',
                client_payload: payload,
            });

            console.log('GitHub Actions triggered successfully');
        }

    } catch (error) {
        console.error('Error processing CloudWatch Logs event:', error);
        throw error;
    }
};
