import {NextRequest,NextResponse} from 'next/server';import {viewer} from '@/lib/supabase';import {adminDb} from '@/lib/admin-db';import {paypalRequest} from '@/lib/paypal';import {z} from 'zod';
export async function POST(request:NextRequest){try{
 if(request.headers.get('origin')!==new URL(request.url).origin)return NextResponse.json({error:'Origen no válido'},{status:403});
 const {user}=await viewer();if(!user)return NextResponse.json({error:'Inicia sesión'},{status:401});
 const orderId=z.string().regex(/^[A-Z0-9]{8,30}$/).parse((await request.json()).orderId);
 const db=adminDb();const {data:p}=await db.from('payments').select('*').eq('provider_order_id',orderId).eq('user_id',user.sub).eq('provider','paypal').single();if(!p)return NextResponse.json({error:'Orden no encontrada'},{status:404});
 if(p.status==='completed')return NextResponse.json({ok:true});
 const existing=await paypalRequest(`/v2/checkout/orders/${orderId}`);
 const order=existing.status==='COMPLETED'?existing:await paypalRequest(`/v2/checkout/orders/${orderId}/capture`,{});
 const unit=order.purchase_units?.[0],capture=unit?.payments?.captures?.[0];
 if(order.id!==orderId||order.status!=='COMPLETED'||capture?.status!=='COMPLETED'||unit.reference_id!==p.course_id||capture.amount?.currency_code!=='USD'||Number(capture.amount?.value).toFixed(2)!==Number(p.amount).toFixed(2))throw Error('La captura no coincide con la orden');
 const {error}=await db.rpc('finalize_paypal_payment',{p_order_id:orderId,p_capture_id:capture.id});if(error)throw error;
 return NextResponse.json({ok:true});
 }catch(e){return NextResponse.json({error:e instanceof Error?e.message:'No se pudo confirmar el pago'},{status:400})}}
