import * as url from 'url'
import * as tds from 'tedious'
import * as pool from 'tedious-connection-pool'
import {Pool} from './pool'
import {ITsql, IQuery} from './'

/**
 * Connection wrapper
 */
export class Connection implements ITsql {
  readonly config: tds.ConnectionConfig
  readonly pool?: Pool

  protected connection?: Promise<tds.Connection | pool.PooledConnection>

  /**
   * Create new connection
   */
  constructor(init: string | tds.ConnectionConfig | tds.Connection, pool?: Pool) {
    // don't use instanceof in case of conflicting tedious versions
    if (typeof(init) === 'object' && init.constructor.name === 'Connection') {
      this.config = (init as any).config
      this.connection = Promise.resolve(init)
      this.pool = pool
    } else {
      this.config = Connection.config(init)
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

      this.connection = new Promise<tds.Connection>((resolve, reject) => {
        let connection = new tds.Connection(this.config)
        connection.on('connect', function(err?: Error) {
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
        return new Promise<void>(function(resolve) {
          connection.on('end', function() {
            resolve()
          })
        })
      }
    }
  }

  /**
   * Execute query function or tagged template
   */
  query<T = any>(input: string | TemplateStringsArray | IQuery, ...paramsArray: any[]) {
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

    } else {
      if (paramsArray.length) {
        throw new Error('A query object cannot be combined with a parameter object')
      }

      query = (input as IQuery).text
      ;(input as IQuery).values.forEach(function(param, idx) {
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
            type = /^\d+$/.test(value) ? tds.TYPES.Int : tds.TYPES.Float
          break
          case 'object':
            if (value === null) {
              type = tds.TYPES.Null
            } else if (value instanceof Date) {
              type = tds.TYPES.DateTime
              value = value.toISOString()
            }
          break
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
  static config(config: string | tds.ConnectionConfig): tds.ConnectionConfig {
    if (typeof(config) === 'string') {
      let parts = url.parse(config)
      let [userName, password] = (parts.auth || '').split(':')
      let [database, instanceName] = (parts.pathname || '').slice(1).split('/')

      config = {
        userName,
        password,
        server: parts.hostname,
        options: {
          database,
          port: parts.port,
          instanceName
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
}
