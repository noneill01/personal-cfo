import type { SpendingNature } from '../lib/types';
import { SPENDING_NATURES } from '../lib/spending-nature';

export default function SpendingNatureSelect({value,onChange,label,inherit=false}:{value?:SpendingNature;onChange:(value:SpendingNature|undefined)=>void;label:string;inherit?:boolean}) {
  return <label>Spending analysis<select aria-label={label} value={value??(inherit?'':'unclassified')} onChange={event=>onChange((event.target.value||undefined) as SpendingNature|undefined)}>
    {inherit&&<option value="">Use category / subcategory</option>}
    {Object.entries(SPENDING_NATURES).map(([key,name])=><option key={key} value={key}>{name}</option>)}
  </select></label>;
}
