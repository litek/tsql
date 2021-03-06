import {Pool, Connection} from '../'
import {expect} from 'chai'

describe('tsql', function() {
  let pool: Pool
  this.timeout(6500)

  beforeEach(function() {
    pool && pool.close()
    pool = new Pool(process.env.DATABASE_URL || 'mssql://sa@127.0.0.1/F0001', {min: 1, max: 2})
  })

  it('acquires pooled connection', async function() {
    let client = await pool.acquire()
    expect(client).instanceof(Connection)

    let res = await client.query("SELECT 'client' as [key], 'data' as value")
    expect(res).eqls([{key: 'client', value: 'data'}])

    client.close()
  })

  it('executes directly from pool', async function() {
    let res = await pool.query("SELECT 'pool' as [key], 'data' as value")
    expect(res).eqls([{key: 'pool', value: 'data'}])
  })

  it('supports tagged templates', async function() {
    let key = 'tkey', data = 32
    let res = await pool.query`SELECT ${key} as [key], ${data} as value UNION ALL SELECT ${key}, ${data}`
    expect(res).eqls([{key, value: data}, {key, value: data}])
  })

  it('accepts query object', async function() {
    let query = {
      text: 'SELECT @1 as val',
      values: ['something']
    }

    let res = await pool.query(query)
    expect(res).eqls([{val: 'something'}])
  })

  it('creates unpooled client', async function() {
    let client = pool.client()
    let connection = await client.connect()
    expect(!!client.pool).be.false
  })

  it('waits for pooled object', async function() {
    let one = await pool.acquire()
    let two = await pool.acquire()

    let timer = false
    setTimeout(() => {
      timer = true
      one.close()
    }, 1000)

    let three = await pool.acquire()
    expect(timer).be.true
  })

  it('parses connection strings', function() {
    let config = {userName: 'user', password: 'pass', server: 'hostname'}
    let options = {database: 'database', port: null, connectTimeout: 5000, requestTimeout: 5000}

    expect(Connection.config('mssql://user:pass@hostname/database?encrypt')).eqls({
      ...config, options: {...options, encrypt: true, instanceName: undefined}
    })

    expect(Connection.config('mssql://user:pass@hostname/instance/database')).eqls({
      ...config, options: {...options, instanceName: 'instance'}
    })
  })

  it('supports json output', async function() {
    let res = await pool.json`
      with
        books as (select 1 as id, 'Book #1' as title union select 2 as id ,'Book #2'),
        author as (select 1 as id, 'Frank' as name)
      select author.id, author.name, (select id, title from books for json path) books
      from author for json path
    `

    expect(res).eqls([
      {
        id: 1,
        name: 'Frank',
        books: [
          {
            id: 1,
            title: 'Book #1'
          },
          {
            id: 2,
            title: 'Book #2'
          }
        ]
      }
    ])
  })

  it('pool throws errors', function(done) {
    pool.query('SELECT *')
      .then(
        () => { done(new Error('Expected to throw')) },
        err => done()
      )
  })

  it('pooled connection throws errors', function(done) {
    pool.acquire()
      .then(db => db.query('SELECT *'))
      .then(
        () => { done(new Error('Expected to throw')) },
        err => done()
      )
  })

  it('unpooled connection throws errors', function(done) {
    let db = new Connection(process.env.DATABASE_URL || 'mssql://sa@127.0.0.1/F0001')

    db.connect()
      .then(() => db.query('SELECT *'))
      .then(
        () => { done(new Error('Expected to throw')) },
        err => done()
      )
  })

  it('inserts null', async function() {
    let db = new Connection(process.env.DATABASE_URL || 'mssql://sa@127.0.0.1/F0001')

    await db.begin()
    await db.query('CREATE TABLE tmp_tsql_test (a nvarchar, b tinyint)')
    await db.query('INSERT INTO tmp_tsql_test VALUES(@1, @2)', {1: null, 2: null})
    await db.query('DROP TABLE tmp_tsql_test')
    await db.commit()
  })
})
