import { defineKnowledgeSource } from '@chamvi/knowledge';
import type { DataSource } from 'typeorm';

// #region database
type FaqRow = {
    id: number; 
    question: string; 
    answer: string; 
    updated_at: Date 
};

// a table your team maintains: read in pages, so a large table never sits in memory at once
export function faqSource(dataSource: DataSource) {
    return defineKnowledgeSource({
        kind: 'faq',
        async* documents({ signal }) {
            let after = 0;

            while (!signal.aborted) {
                const rows: FaqRow[] = await dataSource.query(
                    'SELECT id, question, answer, updated_at FROM faq WHERE id > $1 ORDER BY id LIMIT 500',
                    [after],
                );

                if (rows.length === 0) {
                    return;
                }

                for (const row of rows) {
                    yield {
                        id: `faq-${row.id}`,
                        title: row.question,
                        content: `${row.question}\n\n${row.answer}`,
                        metadata: { updatedAt: row.updated_at.toISOString() },
                    };
                }

                after = rows[rows.length - 1]!.id;
            }
        },
    });
}
// #endregion database

// #region api
type Page = {
    articles: Array<{
        slug: string; 
        title: string; 
        body: string; 
        url: string 
    }>;
    next?: string 
};

// a paginated API customers write to: untrusted, and a failed page keeps what was indexed
export const helpCenter = defineKnowledgeSource({
    kind: 'help-center',
    trusted: false,
    async* documents({ signal, incomplete }) {
        let url: string | undefined = 'https://help.example.com/api/articles?limit=100';
        let first = true;

        while (url) {
            const response: Response = await fetch(url, { signal });

            if (!response.ok) {
                if (first) {
                    // nothing read: throw, the pass fails and is retried on the backoff, nothing is deleted
                    throw new Error(`help center answered ${response.status}`);
                }

                // a later page: keep what this pass yielded, delete nothing, re-embed nothing away
                incomplete(`${url} answered ${response.status}`);

                return;
            }

            first = false;

            const page = await response.json() as Page;

            for (const article of page.articles) {
                yield {
                    id: article.slug,
                    title: article.title,
                    source: article.url,
                    content: article.body,
                };
            }

            url = page.next;
        }
    },
});
// #endregion api
