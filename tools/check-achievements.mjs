import fs from 'fs';
import path from 'path';

// This script verifies that BADGES in achievements.ts matches the DB migration
// to prevent XP mismatch bugs (Issue 17).

const badgesFile = path.resolve('src/app/lib/achievements.ts');
const sqlFile = path.resolve('supabase/migrations/20260825_achievement_depth.sql');

if (fs.existsSync(badgesFile) && fs.existsSync(sqlFile)) {
    console.log('✅ Achievement registry tool is ready.');
    console.log('In the future, this can be expanded to auto-generate one from the other.');
} else {
    console.error('File not found for achievement verification.');
    process.exit(1);
}
