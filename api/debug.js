export default async function handler(req, res) {
  const isProduction = req.headers.host?.includes('vercel.app') || process.env.NODE_ENV === 'production';
  
  if (isProduction) {
    // Only in production, hide real values
    return res.status(200).json({
      environment: 'production',
      MERCADO_PAGO_ACCESS_TOKEN: process.env.MERCADO_PAGO_ACCESS_TOKEN ? '✅ SET' : '❌ MISSING',
      AccessToken: process.env.AccessToken ? '✅ SET' : '❌ MISSING',
      MP_ACCESS_TOKEN: process.env.MP_ACCESS_TOKEN ? '✅ SET' : '❌ MISSING',
      ACCESS_TOKEN: process.env.ACCESS_TOKEN ? '✅ SET' : '❌ MISSING',
      POSTGRES_URL: process.env.POSTGRES_URL ? '✅ SET' : '❌ MISSING',
      DATABASE_URL: process.env.DATABASE_URL ? '✅ SET' : '❌ MISSING',
      NEON_DATABASE_URL: process.env.NEON_DATABASE_URL ? '✅ SET' : '❌ MISSING',
      NODE_ENV: process.env.NODE_ENV,
      timestamp: new Date().toISOString()
    });
  }

  // Docker/Local development - show all values
  return res.status(200).json({
    environment: 'development',
    MERCADO_PAGO_ACCESS_TOKEN: process.env.MERCADO_PAGO_ACCESS_TOKEN || 'MISSING',
    AccessToken: process.env.AccessToken || 'MISSING',
    MP_ACCESS_TOKEN: process.env.MP_ACCESS_TOKEN || 'MISSING',
    ACCESS_TOKEN: process.env.ACCESS_TOKEN || 'MISSING',
    POSTGRES_URL: process.env.POSTGRES_URL ? 'SET (length: ' + process.env.POSTGRES_URL.length + ')' : 'MISSING',
    DATABASE_URL: process.env.DATABASE_URL ? 'SET (length: ' + process.env.DATABASE_URL.length + ')' : 'MISSING',
    NEON_DATABASE_URL: process.env.NEON_DATABASE_URL ? 'SET (length: ' + process.env.NEON_DATABASE_URL.length + ')' : 'MISSING',
    NODE_ENV: process.env.NODE_ENV,
    lastUpdated: new Date().toISOString()
  });
}
