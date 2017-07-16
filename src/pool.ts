import * as tds from 'tedious'
import * as pool from 'tedious-connection-pool'
import {Connection} from './connection'
import {IAdapter, IConfig, IQuery} from './'

/**
 * Pooled connection handler
 */
export class Pool implements IAdapter {
  readonly config: tds.ConnectionConfig
  readonly options: pool.PoolConfig
  readonly pool: pool

  protected initialized = false

  /**
   * Create new connection pool
   */
  constructor(config?: IConfig, options: pool.PoolConfig = {}) {
    this.config = Connection.config(config || process.env.DATABASE_URL || '')
    this.options = Object.assign({
      min: 1,
      max: 10,
      acquireTimeout: this.config.options!.connectTimeout! + 1000
    }, options)

    this.pool = new pool(this.options, this.config)
    this.pool.on('error', function() {})
  }

  /**
   * Listen to pool errors in order to attach to failed acquires
   */
  protected error() {
    let error: Error
    let fn = (err: Error) => error = err
    this.pool.on('error', fn)

    return () => {
      this.pool.removeListener('error', fn)
      return error
    }
  }

  /**
   * Acquire connection from pool
   */
  acquire() {
    return new Promise<Connection>((resolve, reject) => {
      let listener = this.error()
      let noDeprecation = Connection.noDeprecation()

      this.pool.acquire((err, res) => {
        let perr = listener()
        noDeprecation()

        if (err) {
          reject(perr || err)
        } else {
          resolve(new Connection(res, this))
        }
      })
    })
  }

  /**
   * Release connection resource back to pool
   */
  release(connection: pool.PooledConnection | Connection) {
    if (connection instanceof Connection) {
      if (!connection.pool) {
        throw new Error('Cannot release unpooled connection')
      }
      connection.close()
    } else {
      connection.release()
    }
  }

  /**
   * Drain connections from pool
   */
  close() {
    this.pool.drain()
  }

  /**
   * Create new unpooled client
   */
  client() {
    return new Connection(this.config)
  }

  /**
   * Run JSON and release connection
   */
  async json<T = any>(text: string | TemplateStringsArray | IQuery, ...paramsArray: any[]) {
    let connection = await this.acquire()
    let rows = await connection.json<T>(text, ...paramsArray)
    connection.close()

    return rows
  }

  /**
   * Run query and release connection
   */
  async query<T = any>(text: string | TemplateStringsArray | IQuery, ...paramsArray: any[]) {
    let connection = await this.acquire()
    let rows = await connection.query<T>(text, ...paramsArray)
    connection.close()

    return rows
  }
}
