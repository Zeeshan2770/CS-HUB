// Python source: a small stand-in for mysql.connector that runs on SQLite inside the browser.
// It is NOT a MySQL server. It exists so typical classroom code (connect, cursor, execute, fetch, commit) can run.
export default String.raw`
import sqlite3, re, sys, types

class Error(Exception):
    def __init__(self, msg='', errno=None, sqlstate=None):
        super().__init__(msg)
        self.msg = msg; self.errno = errno; self.sqlstate = sqlstate
    def __str__(self):
        return (str(self.errno) + ' (' + (self.sqlstate or 'HY000') + '): ' + self.msg) if self.errno else self.msg
class InterfaceError(Error): pass
class DatabaseError(Error): pass
class DataError(DatabaseError): pass
class OperationalError(DatabaseError): pass
class IntegrityError(DatabaseError): pass
class InternalError(DatabaseError): pass
class ProgrammingError(DatabaseError): pass
class NotSupportedError(DatabaseError): pass

_db = sqlite3.connect(':memory:', check_same_thread=False, isolation_level=None)
_databases = {'information_schema', 'mysql', 'performance_schema', 'sys'}

def _translate(sql):
    s = sql.strip().rstrip(';')
    s = re.sub(r'ENGINE\s*=\s*\w+', '', s, flags=re.I)
    s = re.sub(r'(DEFAULT\s+)?CHARSET\s*=\s*\w+', '', s, flags=re.I)
    s = re.sub(r'COLLATE\s*=?\s*\w+', '', s, flags=re.I)
    s = re.sub(r'\bINT(?:EGER)?\s*(?:\(\d+\))?\s+(?:NOT\s+NULL\s+)?AUTO_INCREMENT\s+PRIMARY\s+KEY', 'INTEGER PRIMARY KEY AUTOINCREMENT', s, flags=re.I)
    s = re.sub(r'\bINT(?:EGER)?\s*(?:\(\d+\))?\s+(?:NOT\s+NULL\s+)?PRIMARY\s+KEY\s+AUTO_INCREMENT', 'INTEGER PRIMARY KEY AUTOINCREMENT', s, flags=re.I)
    s = re.sub(r'\bAUTO_INCREMENT\b', '', s, flags=re.I)
    s = re.sub(r'\bNOW\s*\(\s*\)', 'CURRENT_TIMESTAMP', s, flags=re.I)
    s = s.replace(chr(96), '"')
    s = re.sub(r'%\((\w+)\)s', r':\1', s)
    s = s.replace('%s', '?')
    return s

def _map_error(e, sql):
    m = str(e)
    if isinstance(e, sqlite3.IntegrityError):
        if 'UNIQUE' in m or 'PRIMARY KEY' in m:
            return IntegrityError("Duplicate entry for key (" + m + ")", 1062, '23000')
        return IntegrityError(m, 1048, '23000')
    if 'no such table' in m:
        t = m.split(':')[-1].strip()
        return ProgrammingError("Table '" + t + "' doesn't exist", 1146, '42S02')
    if 'no such column' in m or 'has no column' in m:
        return ProgrammingError("Unknown column (" + m + ")", 1054, '42S22')
    if 'already exists' in m:
        return ProgrammingError(m.replace('table', 'Table'), 1050, '42S01')
    if 'syntax error' in m:
        return ProgrammingError("You have an error in your SQL syntax; check the manual (" + m + ")", 1064, '42000')
    if isinstance(e, sqlite3.ProgrammingError):
        return ProgrammingError(m, 1064, '42000')
    return DatabaseError(m, 1105, 'HY000')

class MySQLCursor:
    def __init__(self, conn, dictionary=False, buffered=False):
        self._conn = conn; self._dict = dictionary
        self._rows = []; self._pos = 0
        self.rowcount = -1; self.lastrowid = None; self.description = None
        self.column_names = ()
    def _set(self, cur, names=None, rows=None):
        self.description = None
        if cur is not None and cur.description:
            self.description = tuple((d[0], None, None, None, None, None, None) for d in cur.description)
        self.column_names = tuple(names) if names else tuple(d[0] for d in (cur.description or [])) if cur is not None else ()
        data = rows if rows is not None else (cur.fetchall() if cur is not None and cur.description else [])
        if self._dict:
            self._rows = [dict(zip(self.column_names, r)) for r in data]
        else:
            self._rows = [tuple(r) for r in data]
        self._pos = 0
        if cur is not None:
            self.rowcount = len(self._rows) if cur.description else cur.rowcount
            self.lastrowid = cur.lastrowid
    def execute(self, operation, params=None, multi=False):
        global _databases
        if self._conn._closed: raise InterfaceError('Cursor is not connected', 2055)
        raw = operation.strip().rstrip(';')
        up = raw.upper()
        m = re.match(r'CREATE\s+DATABASE\s+(IF\s+NOT\s+EXISTS\s+)?(\w+)', raw, re.I)
        if m:
            name = m.group(2)
            if name in _databases and not m.group(1): raise DatabaseError("Can't create database '" + name + "'; database exists", 1007, 'HY000')
            _databases.add(name); self._set(None, rows=[]); self.rowcount = 1; return
        m = re.match(r'DROP\s+DATABASE\s+(IF\s+EXISTS\s+)?(\w+)', raw, re.I)
        if m:
            _databases.discard(m.group(2)); self._set(None, rows=[]); return
        m = re.match(r'USE\s+(\w+)', raw, re.I)
        if m:
            if m.group(1) not in _databases: raise ProgrammingError("Unknown database '" + m.group(1) + "'", 1049, '42000')
            self._conn.database = m.group(1); self._set(None, rows=[]); return
        if up == 'SHOW DATABASES':
            self._set(None, names=['Database'], rows=[(d,) for d in sorted(_databases)]); return
        if up == 'SHOW TABLES':
            r = _db.execute("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").fetchall()
            self._set(None, names=['Tables_in_' + (self._conn.database or 'db')], rows=r); return
        m = re.match(r'(?:DESCRIBE|DESC|SHOW\s+COLUMNS\s+FROM)\s+(\w+)', raw, re.I)
        if m:
            try:
                r = _db.execute('PRAGMA table_info(' + m.group(1) + ')').fetchall()
            except sqlite3.Error as e:
                raise _map_error(e, raw)
            if not r: raise ProgrammingError("Table '" + m.group(1) + "' doesn't exist", 1146, '42S02')
            self._set(None, names=['Field', 'Type', 'Null', 'Key', 'Default', 'Extra'],
                      rows=[(c[1], c[2].lower() or 'text', 'NO' if c[3] else 'YES', 'PRI' if c[5] else '', c[4], '') for c in r]); return
        if re.search(r'ON\s+DUPLICATE\s+KEY', raw, re.I):
            raise NotSupportedError('ON DUPLICATE KEY UPDATE is not supported by the in-browser stand-in. Use INSERT OR REPLACE-style logic in Python instead.', 1235)
        sql = _translate(operation)
        if params is not None and not isinstance(params, (tuple, list, dict)):
            params = (params,)
        try:
            cur = _db.execute(sql, params if params is not None else ())
        except sqlite3.Error as e:
            raise _map_error(e, raw)
        self._set(cur)
    def executemany(self, operation, seq_params):
        sql = _translate(operation); n = 0
        try:
            for p in seq_params:
                cur = _db.execute(sql, p); n += cur.rowcount
        except sqlite3.Error as e:
            raise _map_error(e, operation)
        self._rows = []; self.rowcount = n
    def fetchone(self):
        if self._pos >= len(self._rows): return None
        r = self._rows[self._pos]; self._pos += 1; return r
    def fetchmany(self, size=1):
        out = self._rows[self._pos:self._pos + size]; self._pos += len(out); return out
    def fetchall(self):
        out = self._rows[self._pos:]; self._pos = len(self._rows); return out
    def close(self): return True
    def __iter__(self):
        while True:
            r = self.fetchone()
            if r is None: return
            yield r
    def __enter__(self): return self
    def __exit__(self, *a): self.close()

class MySQLConnection:
    def __init__(self, **kw):
        global _databases
        self._closed = False
        self.database = kw.get('database')
        if self.database: _databases.add(self.database)   # lenient: a missing database is created
        self.autocommit = kw.get('autocommit', False)
        self.user = kw.get('user'); self.server_host = kw.get('host', 'localhost')
    def cursor(self, buffered=False, dictionary=False, **kw):
        if self._closed: raise InterfaceError('MySQL Connection not available.', 2055)
        return MySQLCursor(self, dictionary=dictionary)
    def commit(self): 
        if self._closed: raise InterfaceError('MySQL Connection not available.', 2055)
    def rollback(self): pass
    def close(self): self._closed = True
    def disconnect(self): self._closed = True
    def is_connected(self): return not self._closed
    def ping(self, *a, **k): return not self._closed
    def reconnect(self, *a, **k): self._closed = False
    def __enter__(self): return self
    def __exit__(self, *a): self.close()

def connect(*args, **kwargs):
    return MySQLConnection(**kwargs)

def _install():
    pkg = types.ModuleType('mysql'); pkg.__path__ = []
    con = types.ModuleType('mysql.connector')
    for name in ['Error','InterfaceError','DatabaseError','DataError','OperationalError','IntegrityError','InternalError','ProgrammingError','NotSupportedError','MySQLConnection','MySQLCursor','connect']:
        setattr(con, name, globals()[name])
    con.__version__ = 'browser-standin'
    con.Connect = connect
    errs = types.ModuleType('mysql.connector.errors')
    for name in ['Error','InterfaceError','DatabaseError','DataError','OperationalError','IntegrityError','InternalError','ProgrammingError','NotSupportedError']:
        setattr(errs, name, globals()[name])
    con.errors = errs
    pkg.connector = con
    sys.modules['mysql'] = pkg; sys.modules['mysql.connector'] = con; sys.modules['mysql.connector.errors'] = errs
_install()
`;
