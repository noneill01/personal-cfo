"use client";
import {useState} from 'react';
import Dialog from './Dialog';

export default function AddDataMenu({navigate,uploadPayslip}:{navigate:(screen:string)=>void;uploadPayslip:()=>void}) {
  const [open,setOpen]=useState(false);
  function choose(action:()=>void){setOpen(false);action();}
  return <><button className="primary" onClick={()=>setOpen(true)}>＋ Add data</button>{open&&<Dialog className="add-data-dialog" labelledBy="add-data-title" onClose={()=>setOpen(false)}>
    <button className="detail-close" aria-label="Close Add data" onClick={()=>setOpen(false)}>×</button>
    <h2 id="add-data-title">What would you like to update?</h2>
    <div className="settings-directory">
      <button onClick={()=>choose(()=>navigate('Update'))}><strong>Bank or credit-card activity</strong><span>Generic CSV, or a supported provider statement. Preview before importing.</span></button>
      <button onClick={()=>choose(uploadPayslip)}><strong>Payslip</strong><span>Upload an employer PDF.</span></button>
      <button onClick={()=>choose(()=>navigate('Income'))}><strong>Enter payroll figures</strong><span>View saved payslips or enter figures manually.</span></button>
      <button onClick={()=>choose(()=>navigate('Accounts'))}><strong>Account balances</strong><span>Update cash, investments, pensions and debt.</span></button>
    </div>
  </Dialog>}</>;
}
