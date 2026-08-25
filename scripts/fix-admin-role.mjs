import pg from 'pg';
const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

try {
  // Corrigir roles dos usuários
  await pool.query(`UPDATE "user" SET role = 'user' WHERE email = 'anselmotadeufg@gmail.com'`);
  console.log('Corrigido: anselmotadeufg@gmail.com -> role: user');
  
  await pool.query(`UPDATE "user" SET role = 'admin' WHERE email = 'anselmotadeu@outlook.com'`);
  console.log('Corrigido: anselmotadeu@outlook.com -> role: admin');
  
  // Verificar resultado
  const usersResult = await pool.query(`
    SELECT email, name, role 
    FROM "user" 
    ORDER BY "createdAt" DESC
  `);
  
  console.log('\nUsuários após correção:');
  usersResult.rows.forEach(u => {
    console.log('  ' + u.email + ' | ' + u.name + ' | role: ' + u.role);
  });
  
  await pool.end();
  console.log('\nConcluído');
  
} catch (err) {
  console.error('Erro:', err.message);
  await pool.end();
  process.exit(1);
}
