import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { randomUUID } from 'node:crypto';
import initSqlJs from 'sql.js';
import { createRequire } from 'node:module';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const here = dirname(fileURLToPath(import.meta.url));
const dbPath = process.env.DB_PATH || join(here, 'data', 'roster.sqlite');
mkdirSync(dirname(dbPath), { recursive: true });
const SQL = await initSqlJs({ locateFile: file => require.resolve('sql.js/dist/' + file) });
const db = new SQL.Database(exists(dbPath) ? new Uint8Array(readFileSync(dbPath)) : undefined);
function exists(path) { try { readFileSync(path); return true; } catch { return false; } }
db.run('CREATE TABLE IF NOT EXISTS nurses (id TEXT PRIMARY KEY, name TEXT NOT NULL, skill TEXT NOT NULL)');
db.run('CREATE TABLE IF NOT EXISTS patients (id TEXT PRIMARY KEY, name TEXT NOT NULL, skill TEXT NOT NULL)');
db.run('CREATE TABLE IF NOT EXISTS shifts (id TEXT PRIMARY KEY, patient TEXT NOT NULL, nurse TEXT NOT NULL, day INTEGER NOT NULL, start TEXT NOT NULL, end TEXT NOT NULL, type TEXT NOT NULL, checkIn TEXT, checkOut TEXT, recurring INTEGER NOT NULL DEFAULT 0)');
db.run('CREATE TABLE IF NOT EXISTS leaves (id TEXT PRIMARY KEY, nurse TEXT NOT NULL, day INTEGER NOT NULL, suggested TEXT)');
function rows(table) { const result=db.exec('SELECT * FROM '+table)[0]; if(!result)return []; return result.values.map(values=>Object.fromEntries(result.columns.map((column,i)=>[column,values[i]]))); }
let nurses=rows('nurses'), patients=rows('patients'), shifts=rows('shifts').map(s=>({...s,day:Number(s.day),recurring:!!s.recurring})), leaves=rows('leaves').map(l=>({...l,day:Number(l.day)}));
const demoNurses=[{id:'asha',name:'Asha Rao',skill:'Elder care'},{id:'kavya',name:'Kavya Nair',skill:'Dementia care'},{id:'priya',name:'Priya Das',skill:'Elder care'},{id:'sana',name:'Sana Khan',skill:'Recovery care'},{id:'divya',name:'Divya Menon',skill:'Dementia care'},{id:'rohit',name:'Rohit Shah',skill:'Elder care'}];
const demoPatients=[{id:'meera',name:'Meera Iyer',skill:'Elder care'},{id:'rajan',name:'Rajan Menon',skill:'Recovery care'},{id:'leela',name:'Leela Shah',skill:'Dementia care'}];
function add(patient,nurse,day,start,end,type){shifts.push({id:randomUUID(),patient,nurse,day,start,end,type,checkIn:null,checkOut:null,recurring:true})}
function persist(){
  db.run('BEGIN TRANSACTION');
  try {
    for(const table of ['nurses','patients','shifts','leaves']) db.run('DELETE FROM '+table);
    const nurseStmt=db.prepare('INSERT INTO nurses (id,name,skill) VALUES (?,?,?)'); for(const n of nurses)nurseStmt.run([n.id,n.name,n.skill]); nurseStmt.free();
    const patientStmt=db.prepare('INSERT INTO patients (id,name,skill) VALUES (?,?,?)'); for(const p of patients)patientStmt.run([p.id,p.name,p.skill]); patientStmt.free();
    const shiftStmt=db.prepare('INSERT INTO shifts (id,patient,nurse,day,start,end,type,checkIn,checkOut,recurring) VALUES (?,?,?,?,?,?,?,?,?,?)'); for(const s of shifts)shiftStmt.run([s.id,s.patient,s.nurse,s.day,s.start,s.end,s.type,s.checkIn,s.checkOut,s.recurring?1:0]); shiftStmt.free();
    const leaveStmt=db.prepare('INSERT INTO leaves (id,nurse,day,suggested) VALUES (?,?,?,?)'); for(const l of leaves)leaveStmt.run([l.id,l.nurse,l.day,l.suggested]); leaveStmt.free();
    db.run('COMMIT'); writeFileSync(dbPath, Buffer.from(db.export()));
  } catch(error) { db.run('ROLLBACK'); throw error; }
}
if(nurses.length===0){
  nurses=demoNurses; patients=demoPatients;
  for(let p=0;p<patients.length;p++)for(let day=0;day<7;day++){
    const patient=patients[p].id,pair=p===0?['asha','kavya']:p===1?['sana','priya']:['divya','kavya'];
    if(p===0&&day===2){add(patient,'asha',day,'08:00','14:00','day');add(patient,'kavya',day,'20:00','08:00','night');continue}
    add(patient,pair[0],day,'08:00','20:00',day===6?'relief':'day');add(patient,pair[1],day,'20:00','08:00','night');
  }
  add('meera','divya',5,'08:00','20:00','relief'); persist();
}
const app=express(); app.use(cors()); app.use(express.json());
const days=['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
const minutes=t=>{const [h,m]=t.split(':').map(Number);return h*60+m};
const hours=s=>{let v=minutes(s.end)-minutes(s.start);if(v<=0)v+=1440;return v/60};
function overlaps(a,b){const x=minutes(a.start),y=minutes(b.start);return Math.max(x,y)<Math.min(x+hours(a)*60,y+hours(b)*60)}
function conflicts(){const out=[];for(let i=0;i<shifts.length;i++)for(let j=i+1;j<shifts.length;j++){const a=shifts[i],b=shifts[j];if(a.nurse===b.nurse&&a.day===b.day&&overlaps(a,b))out.push({a:a.id,b:b.id,nurse:a.nurse,day:a.day})}return out}
function gaps(){const out=[];for(const p of patients)for(let day=0;day<7;day++){const spans=shifts.filter(s=>s.patient===p.id&&s.day===day).map(s=>[minutes(s.start),minutes(s.start)+hours(s)*60]).sort((a,b)=>a[0]-b[0]);let cursor=0;for(const [a,b] of spans){if(a>cursor)out.push({patient:p.id,day,start:cursor,end:a});cursor=Math.max(cursor,b)}if(cursor<1440)out.push({patient:p.id,day,start:cursor,end:1440})}return out}
app.get('/api/roster',(req,res)=>res.json({nurses,patients,shifts,leaves,conflicts:conflicts(),gaps:gaps(),days}));
app.post('/api/shifts',(req,res)=>{const s={id:randomUUID(),checkIn:null,checkOut:null,recurring:false,...req.body};if(!patients.some(p=>p.id===s.patient)||!nurses.some(n=>n.id===s.nurse)||!Number.isInteger(s.day)||s.day<0||s.day>6||!s.start||!s.end)return res.status(400).json({error:'Patient, nurse, day and times are required.'});const hit=shifts.find(x=>x.nurse===s.nurse&&x.day===s.day&&overlaps(s,x));if(hit)return res.status(409).json({error:'This nurse already has an overlapping shift.'});shifts.push(s);persist();res.status(201).json(s)});
app.put('/api/shifts/:id',(req,res)=>{const i=shifts.findIndex(s=>s.id===req.params.id);if(i<0)return res.status(404).json({error:'Shift not found.'});const next={...shifts[i],...req.body,id:req.params.id};if(shifts.some(x=>x.id!==next.id&&x.nurse===next.nurse&&x.day===next.day&&overlaps(next,x)))return res.status(409).json({error:'This nurse already has an overlapping shift.'});shifts[i]=next;persist();res.json(next)});
app.delete('/api/shifts/:id',(req,res)=>{const before=shifts.length;shifts=shifts.filter(s=>s.id!==req.params.id);if(before===shifts.length)return res.status(404).json({error:'Shift not found.'});persist();res.status(204).end()});
app.post('/api/shifts/:id/attendance',(req,res)=>{const s=shifts.find(x=>x.id===req.params.id);if(!s)return res.status(404).json({error:'Shift not found.'});const now=new Date().toISOString();if(req.body.action==='check-in'&&!s.checkIn)s.checkIn=now;else if(req.body.action==='check-out'&&s.checkIn&&!s.checkOut)s.checkOut=now;else return res.status(400).json({error:'Attendance action is not valid for this shift.'});persist();res.json(s)});
app.post('/api/leaves',(req,res)=>{const {nurse,day}=req.body;if(!nurses.some(n=>n.id===nurse)||!Number.isInteger(day)||day<0||day>6)return res.status(400).json({error:'Choose a nurse and weekday.'});const person=nurses.find(n=>n.id===nurse);const eligible=nurses.filter(n=>n.id!==nurse&&n.skill===person.skill&&!shifts.some(s=>s.nurse===n.id&&s.day===day));const record={id:randomUUID(),nurse,day,suggested:eligible[0]?.id??null};leaves.push(record);persist();res.status(201).json({...record,suggestions:eligible})});
app.get('/api/payroll.csv',(req,res)=>{const data=[['Nurse','Skill','Weekly hours','Weekly limit','Over limit']];for(const n of nurses){const total=shifts.filter(s=>s.nurse===n.id).reduce((v,s)=>v+hours(s),0);data.push([n.name,n.skill,total,48,total>48?'Yes':'No'])}const csv=data.map(r=>r.map(v=>'"'+String(v).replaceAll('"','""')+'"').join(',')).join('\r\n');res.type('text/csv').attachment('thecarepal-weekly-hours.csv').send(csv)});
app.get('/api/health',(req,res)=>res.json({ok:true,database:'sqlite'}));
const webRoot=join(here,'..','frontend','dist');
app.use(express.static(webRoot));
app.get('*',(req,res)=>res.sendFile(join(webRoot,'index.html')));
const port=process.env.PORT||4000;app.listen(port,()=>console.log('TheCarePal API listening on http://localhost:'+port+' · SQLite database: '+dbPath));