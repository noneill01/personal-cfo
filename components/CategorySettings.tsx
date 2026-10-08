"use client";
import { useState, type Dispatch, type SetStateAction } from "react";
import { addCategory, addSubcategory, updateCategory, updateSubcategory } from "../lib/categories";
import type { CategoryGroup, Store, TransactionRole } from "../lib/types";

const groups: CategoryGroup[] = ["essential", "lifestyle", "future", "income", "transfer", "property", "work"];
const roles:TransactionRole[]=["none","salary","rental-income","maintenance","savings-contribution","savings-challenge","bills-reserve","debt-repayment","transfer"];
export default function CategorySettings({store,setStore}:{store:Store;setStore:Dispatch<SetStateAction<Store>>}) {
  const [name,setName]=useState("");
  const [group,setGroup]=useState<CategoryGroup>("lifestyle");
  const [subNames,setSubNames]=useState<Record<string,string>>({});
  const categories=store.profile?.categories??[];
  const change=(next:typeof categories)=>setStore(current=>{
    if (!current.profile) return current;
    const rename = categories.map(before=>({before,after:next.find(item=>item.id===before.id)})).find(item=>item.after&&item.before.name!==item.after.name);
    const planning=current.profile.planning;
    const rekey=(values:Record<string,number>|undefined)=>{
      if (!values || !rename?.after) return values;
      const result={...values};
      if (Object.prototype.hasOwnProperty.call(result,rename.before.name)) { result[rename.after.name]=result[rename.before.name];delete result[rename.before.name]; }
      return result;
    };
    return {...current,profile:{...current.profile,categories:next,...(planning?{planning:{...planning,budgetPlan:rekey(planning.budgetPlan)??{},seedPlan:rekey(planning.seedPlan)}}:{})}};
  });
  return <article className="panel" style={{marginTop:"1.5rem"}}>
    <div className="panel-head"><div><span className="insight-label">YOUR TAXONOMY</span><h3>Categories &amp; Plan groups</h3><p>Names can change without rewriting old transactions. Archived categories remain in history.</p></div></div>
    <div style={{display:"flex",gap:".75rem",flexWrap:"wrap",alignItems:"end",marginBottom:"1rem"}}>
      <label>New category<input aria-label="New category name" value={name} onChange={event=>setName(event.target.value)}/></label>
      <label>Plan group<select aria-label="New category Plan group" value={group} onChange={event=>setGroup(event.target.value as CategoryGroup)}>{groups.map(value=><option key={value} value={value}>{value}</option>)}</select></label>
      <button className="ghost" onClick={()=>{const next=addCategory(categories,name,group);if(next!==categories){change(next);setName("")}}}>Add category</button>
    </div>
    <div style={{display:"grid",gap:".8rem"}}>{categories.map(category=><details key={category.id} style={{border:"1px solid var(--line, #aaa)",borderRadius:12,padding:".8rem"}}>
      <summary style={{cursor:"pointer",fontWeight:700}}>{category.name} · {category.group}{category.enabled?"":" · archived"}</summary>
      <div style={{display:"flex",gap:".75rem",flexWrap:"wrap",alignItems:"end",marginTop:".8rem"}}>
        <label>Name<input aria-label={`Name for ${category.name}`} value={category.name} onChange={event=>change(updateCategory(categories,category.id,{name:event.target.value}))}/></label>
        <label>Plan group<select aria-label={`Plan group for ${category.name}`} value={category.group} onChange={event=>change(updateCategory(categories,category.id,{group:event.target.value as CategoryGroup}))}>{groups.map(value=><option key={value} value={value}>{value}</option>)}</select></label>
        <label><input type="checkbox" checked={category.enabled} onChange={event=>change(updateCategory(categories,category.id,{enabled:event.target.checked}))}/> Active</label>
      </div>
      <div style={{display:"grid",gap:".5rem",marginTop:".8rem"}}>{category.subcategories.map(sub=><div key={sub.id} style={{display:"flex",gap:".75rem",alignItems:"center"}}>
        <input aria-label={`Subcategory ${sub.name} under ${category.name}`} value={sub.name} onChange={event=>change(updateSubcategory(categories,category.id,sub.id,{name:event.target.value}))}/>
        <select aria-label={`Financial role for ${sub.name} under ${category.name}`} value={sub.role??"none"} onChange={event=>change(updateSubcategory(categories,category.id,sub.id,{role:event.target.value as TransactionRole}))}>{roles.map(role=><option key={role} value={role}>{role}</option>)}</select>
        <label><input type="checkbox" checked={sub.enabled} onChange={event=>change(updateSubcategory(categories,category.id,sub.id,{enabled:event.target.checked}))}/> Active</label>
      </div>)}</div>
      <div style={{display:"flex",gap:".75rem",marginTop:".8rem"}}><input aria-label={`New subcategory under ${category.name}`} placeholder="New subcategory" value={subNames[category.id]??""} onChange={event=>setSubNames(current=>({...current,[category.id]:event.target.value}))}/><button className="ghost" onClick={()=>{const next=addSubcategory(categories,category.id,subNames[category.id]??"");if(next!==categories){change(next);setSubNames(current=>({...current,[category.id]:""}))}}}>Add subcategory</button></div>
    </details>)}</div>
  </article>;
}
