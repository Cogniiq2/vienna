import crypto from 'node:crypto';
const secret = process.env.JWT_SECRET ?? 'super-secret-jwt-token-with-at-least-32-characters-long';
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
export function sign(payload) {
  const h = b64({ alg: 'HS256', typ: 'JWT' }), p = b64({ iat: Math.floor(Date.now()/1000), exp: Math.floor(Date.now()/1000) + 3600*24*30, ...payload });
  return `${h}.${p}.${crypto.createHmac('sha256', secret).update(`${h}.${p}`).digest('base64url')}`;
}
if (process.argv[2]) console.log(sign(JSON.parse(process.argv[2])));
