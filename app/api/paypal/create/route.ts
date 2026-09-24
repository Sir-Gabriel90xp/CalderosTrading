import {NextRequest,NextResponse} from 'next/server';import {viewer} from '@/lib/supabase';import {adminDb} from '@/lib/admin-db';import {paypalRequest} from '@/lib/paypal';import {z} from 'zod';
export async function POST(request:NextRequest){try{
 if(request.headers.get('origin')!==new URL(request.url).origin)return NextResponse.json({error:'Origen no válido'},{status:403});
 const {user,db}=await viewer();if(!user)return NextResponse.json({error:'Inicia sesión'},{status:401});
 const id=z.uuid().parse((await request.json()).courseId);const {data:course}=await db.from('courses').select('id,title,paypal_usd_price,published').eq('id',id).eq('published',true).single();
 if(!course?.paypal_usd_price)return NextResponse.json({error:'Pago PayPal no disponible para este curso'},{status:400});
 const amount=Number(course.paypal_usd_price).toFixed(2);
 const order=await paypalRequest('/v2/checkout/orders',{intent:'CAPTURE',purchase_units:[{reference_id:course.id,amount:{currency_code:'USD',value:amount},description:course.title.slice(0,120)}],application_context:{return_url:`${process.env.NEXT_PUBLIC_SITE_URL}/checkout/return`,cancel_url:`${process.env.NEXT_PUBLIC_SITE_URL}/dashboard`}});
 const {error}=await adminDb().from('payments').insert({user_id:user.sub,course_id:course.id,amount:course.paypal_usd_price,provider:'paypal',provider_order_id:order.id,status:'pending'});if(error)throw error;
 const url=order.links?.find((link:{rel:string,href:string})=>link.rel==='approve')?.href;if(!url||!url.startsWith('https://www.paypal.com/')&&!url.startsWith('https://www.sandbox.paypal.com/'))throw Error('URL de aprobación inválida');
 return NextResponse.json({url});
 }catch(e){return NextResponse.json({error:e instanceof Error?e.message:'Error de pago'},{status:400})}}
