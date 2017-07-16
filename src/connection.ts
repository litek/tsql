import * as assert from 'assert'
import * as url from 'url'
import * as qs from 'querystring'
import * as tds from 'tedious'
import * as pool from 'tedious-connection-pool'
import {Pool} from './pool'
import {Adapter, IConfig, Query} from './'

/**
 * Connection wrapper
 */
export class Connection implements Adapter {
  readonly config: tds.ConnectionConfig
  readonly pool?: Pool

  protected connection?: Promise<tds.Connection | pool.PooledConnection>

  /**
   * Create new connection
   */
  constructor(init?: string | tds.ConnectionConfig | tds.Connection, pool?: Pool) {
    // don't use instanceof in case of conflicting tedious versions
    if (typeof(init) === 'object' && init.constructor.name === 'Connection') {
      this.config = (init as any).config
      this.connection = Promise.resolve(init as tds.Connection)
      this.pool = pool
    } else {
      this.config = Connection.config((init || process.env.DATABASE_URL) as IConfig)
    }
  }

  /**
   * Ensure connection
   */
  async connect() {
    if (!this.connection) {
      if (this.pool) {
        throw new Error('Underlying connection has been returned to pool')
      }

      let noDeprecation = Connection.noDeprecation()
      let connection = new tds.Connection(this.config)

      this.connection = new Promise<tds.Connection>((resolve, reject) => {
        connection.on('connect', function(err?: Error) {
          noDeprecation()
          err ? reject(err) : resolve(connection)
        })
      })
    }
    
    return this.connection
  }

  /**
   * Close connection
   */
  async close() {
    if (this.connection) {
      let connection = await this.connection
      this.connection = undefined
      
      if (this.pool) {
        ;(connection as pool.PooledConnection).release()

      } else {
        connection.close()
        
        return new Promise<void>(function(resolve) {
          connection.on('end', function() {
            resolve()
          })
        })
      }
    }
  }

  /**
   * Begin transaction
   */
  async begin(name?: string, isolationLevel?: tds.ISOLATION_LEVEL) {
    let connection = await this.connect()

    return new Promise<void>(function(resolve, reject) {
      connection.beginTransaction(function(err) {
        err ? reject(err) : resolve()
      }, name, isolationLevel)
    })
  }

  /**
   * Commit transaction
   */
  async commit() {
    let connection = await this.connect()

    return new Promise<void>(function(resolve, reject) {
      connection!.commitTransaction(function(err) {
        err ? reject(err) : resolve()
      })
    })
  }

  /**
   * Grab JSON values
   */
  async json<T = any>(input: string | TemplateStringsArray | Query, ...paramsArray: any[]) {
    let data: any[] = await this.query.apply(this, arguments)

    if (data.length) {
      let col = Object.keys(data[0]).pop()!
      let json = data.map(obj => obj[col]).join('')
      return JSON.parse(json)
    } else {
      return []
    }
  }

  /**
   * Execute query function or tagged template
   */
  query<T = any>(input: string | TemplateStringsArray | Query, ...paramsArray: any[]) {
    let params: any = {}
    let query: string

    // standardize input
    if (input instanceof Array) {
      query = input.reduce((a, b, idx) => {
        params[idx] = paramsArray[idx - 1]
        return [a, '@', idx, b].join('')
      })

    } else if (typeof(input) === 'string') {
      if (paramsArray.length > 1) {
        throw new Error('Only one parameter object is accepted')
      }

      query = input
      params = paramsArray[0] || params

      if (params instanceof Array) {
        let values = params
        params = {}
        values.forEach(function(param, idx) {
          params[idx+1] = param
        })
      }

    } else {
      if (paramsArray.length) {
        throw new Error('A query object cannot be combined with other arguments')
      }

      query = (input as Query).text
      ;(input as Query).values.forEach(function(param, idx) {
        params[idx+1] = param
      })
    }

    return new Promise<T[]>((resolve, reject) => {
      let rows: any[] = []

      let request = new tds.Request(query, function(err, res) {
        err ? reject(err) : resolve(rows)
      })

      request.on('row', function(cols: tds.ColumnValue[]) {
        let row: any = {}
        cols.forEach(col => row[col.metadata.colName] = col.value)
        rows.push(row)
      })

      // typecast parameters
      Object.keys(params).forEach(key => {
        let value = params[key]
        let type = tds.TYPES.NVarChar

        switch (typeof(value)) {
          case 'boolean':
            type = tds.TYPES.Bit
            value = Number(value)
          break
          case 'number':
            if (Math.abs(value) < Math.pow(2, 31)) {
              type = /^\d+$/.test(value) ? tds.TYPES.Int : tds.TYPES.Float
            }
          break
          case 'object':
            if (value === null) {
              value = ''
            } else if (value instanceof Date) {
              type = tds.TYPES.DateTime
              // value = value.toISOString()
            } else {
              value = JSON.stringify(value)
            }
        }

        request.addParameter(key, type, value)
      })

      // ensure connection and run query
      this.connect().then(res => {
        res.execSql(request)
      }, err => {
        reject(err)
      })
    })
  }

  /**
   * Parse connection string and set defaults
   */
  static config(config: IConfig): tds.ConnectionConfig {
    assert(config, 'No connection configuration assigned')

    if (typeof(config) === 'string') {
      let parts = url.parse(config)
      let [userName, password] = (parts.auth || '').split(':')
      let [a, b] = (parts.pathname || '').slice(1).split('/')
      let query = qs.parse(parts.query || '')

      Object.keys(query).forEach(key => {
        if (query[key] === '') {
          query[key] = true
        }
      })

      config = {
        userName,
        password,
        server: parts.hostname,
        options: {
          database: b || a,
          port: parts.port,
          instanceName: b ? a : undefined,
          ...query
        }
      } as tds.ConnectionConfig
    } else {
      config.options = config.options || {}
    }

    let options = config.options!
    options.connectTimeout = options.connectTimeout || 5000
    options.requestTimeout = options.requestTimeout || 5000

    return config
  }

  /**
   * Disable deprecation warnings
   * https://github.com/tediousjs/tedious/issues/515
   */
  static noDeprecationFlag?: boolean

  static noDeprecation() {
    if (typeof(Connection.noDeprecationFlag) === 'undefined') {
      let proc = process as any
      Connection.noDeprecationFlag = proc.noDeprecation || false
      proc.noDeprecation = true

      return function() {
        proc.noDeprecation = Connection.noDeprecationFlag
      }
    } else {
      return function() {}
    }
  }
}
