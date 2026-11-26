import { EntitySchema } from 'typeorm';

export const notes = new EntitySchema<{ id: string; title: string }>({
    name: 'note',
    tableName: 'notes',
    columns: {
        id: {
            type: 'varchar',
            length: 36,
            primary: true,
        },
        title: { type: 'varchar', length: 200 },
    },
});

export const tags = new EntitySchema<{ id: string; label: string }>({
    name: 'tag',
    tableName: 'tags',
    columns: {
        id: {
            type: 'varchar',
            length: 36,
            primary: true,
        },
        label: { type: 'varchar', length: 100 },
    },
});
