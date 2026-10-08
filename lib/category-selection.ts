import { useEffect, type Dispatch, type SetStateAction } from "react";
import { categoryFor } from "./categories.ts";
import type { Store } from "./types.ts";

type ManualDraft={date:string;merchant:string;amount:string;category:string;subcategory:string;account:string};
/** Keep open filters/forms valid after a category is renamed or archived. */
export function useCategorySelectionSync(
  categories:string[],profile:Store["profile"],category:string,setCategory:Dispatch<SetStateAction<string>>,
  setSubcategoryFilter:Dispatch<SetStateAction<string>>,manual:ManualDraft,setManual:Dispatch<SetStateAction<ManualDraft>>,
){
  useEffect(()=>{
    if(category!=="All categories"&&!categories.includes(category)){
      const replacement=categoryFor(profile,category);
      setCategory(replacement?.enabled?replacement.name:"All categories");
      setSubcategoryFilter("All subcategories");
    }
    if(!categories.includes(manual.category)){
      const existing=categoryFor(profile,manual.category),fallback=categoryFor(profile,"Other");
      const replacement=(existing?.enabled?existing.name:undefined)??(fallback?.enabled?fallback.name:undefined)??categories[0];
      if(replacement)setManual(current=>({...current,category:replacement,subcategory:profile?.categories?.find(item=>item.name===replacement)?.subcategories.find(item=>item.enabled)?.name??""}));
    }
  },[categories,category,manual.category,profile,setCategory,setSubcategoryFilter,setManual]);
}
