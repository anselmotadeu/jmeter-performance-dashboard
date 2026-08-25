import { readFileSync } from 'fs';
import pg from 'pg';
const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

try {
  // Verificar se coluna role já existe
  const checkResult = await pool.query(`
    SELECT column_name 
    FROM information_schema.columns 
    WHERE table_name = 'user' AND column_name = 'role'
  `);
  
  if (checkResult.rows.length > 0) {
    console.log('Coluna "role" já existe');
  } else {
    console.log('Executando migration 007...');
    const sql = readFileSync('/opt/data/perf-dash/migrations/007_super_admin_role.sql', 'utf-8');
    await pool.query(sql);
    console.log('Migration 007 executada');
  }
  
  // Buscar todos os usuários
  const usersResult = await pool.query(`
    SELECT id, email, name, role 
    FROM "user" 
    ORDER BY "createdAt" DESC
  `);
  
  console.log('\nUsuários:');
  usersResult.rows.forEach(u => {
    console.log('  ' + u.email + ' | ' + u.name + ' | role: ' + (u.role || 'null'));
  });
  
  // Procurar usuário do Anselmo
  const anselmo = usersResult.rows.find(u => 
    u.email.toLowerCase().includes('anselmo') || 
    u.email.toLowerCase().includes('anselmotadeu')
  );
  
  if (anselmo) {
    console.log('\nUsuario Anselmo encontrado: ' + anselmo.email + ' (id: ' + anselmo.id + ')');
    
    if (anselmo.role !== 'admin') {
      await pool.query(`UPDATE "user" SET role = 'admin' WHERE id = $1`, [anselmo.id]);
      console.log('Usuario ' + anselmo.email + ' definido como admin');
    } else {
      console.log('Usuario ja e admin');
    }
  } else {
    console.log('\nUsuario Anselmo nao encontrado. Lista de emails:');
    usersResult.rows.forEach(u => console.log('  - ' + u.email));
  }
  
  await pool.end();
  console.log('\nConcluido');
  
} catch (err) {
  console.error('Erro:', err.message);
  await pool.end();
  process.exit(1);
}
