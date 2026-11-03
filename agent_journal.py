"""Minimal local call journal: no prompts, parameters, credentials or results."""
import sqlite3, time, secrets
from contextlib import contextmanager
class AgentJournal:
 @contextmanager
 def _db(self):
  db=sqlite3.connect(self.path,timeout=5)
  try:
   with db: yield db
  finally:db.close()
 def __init__(self,path):
  self.path=path
  with self._db() as db:
   db.execute('CREATE TABLE IF NOT EXISTS tool_calls (id TEXT PRIMARY KEY, tool TEXT NOT NULL, state TEXT NOT NULL, created REAL NOT NULL, updated REAL NOT NULL)')
 def start(self,name):
  call_id=secrets.token_urlsafe(16);now=time.time()
  with self._db() as db:db.execute('INSERT INTO tool_calls VALUES (?,?,?,?,?)',(call_id,name,'started',now,now))
  return call_id
 def finish(self,call_id,state):
  if state not in ('returned','failed','unknown'):raise ValueError('bad state')
  with self._db() as db:
   cur=db.execute('UPDATE tool_calls SET state=?,updated=? WHERE id=? AND state=?',(state,time.time(),call_id,'started'))
   if cur.rowcount!=1:raise ValueError('call not active')
 def recover(self):
  with self._db() as db:return db.execute('UPDATE tool_calls SET state=?,updated=? WHERE state=?',('unknown',time.time(),'started')).rowcount
