import 'server-only';
const base=process.env.PAYPAL_ENV==='live'?'https://api-m.paypal.com':'https://api-m.sandbox.paypal.com';
export async function paypalRequest(path:string,body?:unknown){
 const id=process.env.PAYPAL_CLIENT_ID,secret=process.env.PAYPAL_CLIENT_SECRET;
 if(!id||!secret)throw Error('PayPal no configurado');
 const auth=Buffer.from(`${id}:${secret}`).toString('base64');
 const tokenResponse=await fetch(`${base}/v1/oauth2/token`,{method:'POST',headers:{Authorization:`Basic ${auth}`,'Content-Type':'application/x-www-form-urlencoded'},body:'grant_type=client_credentials',cache:'no-store'});
 if(!tokenResponse.ok)throw Error('Error de autenticación PayPal');const {access_token}=await tokenResponse.json();
 const response=await fetch(`${base}${path}`,{method:body?'POST':'GET',headers:{Authorization:`Bearer ${access_token}`,'Content-Type':'application/json','PayPal-Request-Id':crypto.randomUUID()},body:body?JSON.stringify(body):undefined,cache:'no-store'});
 if(!response.ok)throw Error(`PayPal respondió ${response.status}`);return response.json();
}
