export type RecurringFrequency = "weekly" | "monthly" | "quarterly" | "annual" | "irregular";

export function inferRecurringFrequency(payments:{date:string;amount:number}[]):RecurringFrequency {
  const ordered=[...payments].filter(payment=>payment.date).sort((a,b)=>a.date.localeCompare(b.date));
  const intervals=ordered.slice(1).map((payment,index)=>(dateAtNoon(payment.date).getTime()-dateAtNoon(ordered[index].date).getTime())/86400000).sort((a,b)=>a-b);
  if(!intervals.length)return "monthly";
  const median=intervals[Math.floor(intervals.length/2)];
  return median>=250?"annual":median>=60?"quarterly":intervals.length>=2&&median>=6&&median<=8?"weekly":"monthly";
}

const dateAtNoon=(value:string)=>new Date(`${value}T12:00:00`);
const addDays=(value:string,days:number)=>{const date=dateAtNoon(value);date.setDate(date.getDate()+days);return date.toISOString().slice(0,10)};
const isoParts=(value:string)=>({year:Number(value.slice(0,4)),month:Number(value.slice(5,7)),day:Number(value.slice(8,10))});
const daysInMonth=(year:number,month:number)=>new Date(Date.UTC(year,month,0)).getUTCDate();
const monthDay=(year:number,month:number,day:number)=>`${year}-${String(month).padStart(2,"0")}-${String(Math.min(day,daysInMonth(year,month))).padStart(2,"0")}`;
const addMonths=(value:string,months:number)=>{const {year,month,day}=isoParts(value);const nextMonth=month-1+months;return monthDay(year+Math.floor(nextMonth/12),nextMonth%12+1,day)};

/** Dates on which an established recurring commitment is expected in a cycle. */
export function recurringDatesInRange(lastDate:string,frequency:RecurringFrequency,start:string,end:string) {
  if(!lastDate||frequency==="irregular")return [];
  if(frequency==="weekly"){
    const dates:string[]=[];let due=lastDate;
    while(due<start)due=addDays(due,7);
    while(due<=end){dates.push(due);due=addDays(due,7)}
    return dates;
  }
  if(frequency==="monthly"){
    const day=isoParts(lastDate).day;const dates:string[]=[];
    for(let date=start;date<=end;date=addDays(date,1))if(isoParts(date).day===Math.min(day,daysInMonth(isoParts(date).year,isoParts(date).month)))dates.push(date);
    return dates;
  }
  const interval=frequency==="quarterly"?3:12;const dates:string[]=[];let due=lastDate;
  while(due<start)due=addMonths(due,interval);
  while(due<=end){dates.push(due);due=addMonths(due,interval)}
  return dates;
}
