'use client';
import {useState} from 'react';import {browserDb} from '@/lib/supabase-browser';
export default function TransferForm({courseId,amount,userId,currencyCode='DOP',paymentMethod='bank'}:{courseId:string,amount:number,userId:string,currencyCode?:'DOP'|'USD',paymentMethod?:'bank'|'paypal'}){
 const [state,setState]=useState('');const [busy,setBusy]=useState(false);
 async function submit(e:React.FormEvent<HTMLFormElement>){e.preventDefault();setBusy(true);setState('');const form=new FormData(e.currentTarget);const file=form.get('receipt') as File;
  try{if(!file||file.size>5*1024*1024||!['image/jpeg','image/png','application/pdf'].includes(file.type))throw Error('Adjunta JPG, PNG o PDF de hasta 5 MB.');
   const db=browserDb();const path=`${userId}/${crypto.randomUUID()}-${file.name.replace(/[^a-zA-Z0-9._-]/g,'_')}`;
   const {error:up}=await db.storage.from('receipts').upload(path,file,{upsert:false});if(up)throw up;
   const {error}=await db.from('bank_transfers').insert({user_id:userId,course_id:courseId,amount,currency_code:currencyCode,bank:paymentMethod==='paypal'?'PayPal':String(form.get('bank')),reference:String(form.get('reference')),receipt_path:path});if(error)throw error;
   setState(paymentMethod==='paypal'?'Comprobante de PayPal enviado. Revisaremos el pago antes de activar el curso.':'Comprobante enviado. Revisaremos tu transferencia antes de activar el curso.');e.currentTarget.reset();
  }catch(err){setState(err instanceof Error?err.message:'No se pudo enviar el comprobante.')}finally{setBusy(false)}
 }
 return <form onSubmit={submit}>{paymentMethod==='bank'&&<label>Banco desde el que pagaste<input name="bank" required maxLength={100}/></label>}<label>{paymentMethod==='paypal'?'ID de transacción de PayPal':'Número de referencia'}<input name="reference" required maxLength={100}/></label><label>Comprobante<input name="receipt" type="file" accept="image/jpeg,image/png,application/pdf" required/></label><button disabled={busy}>{busy?'Enviando…':'Enviar comprobante'}</button>{state&&<div className="notice" role="status">{state}</div>}</form>
}
