export interface ITsql {
  query<T>(text: string, params: {}): Promise<T[]>
  query<T>(text: TemplateStringsArray, ...params: {}[]): Promise<T[]>
  query<T>(query: IQuery): Promise<T[]>
}

export interface IQuery {
  text: string
  values: any[]
}

export * from './connection'
export * from './pool'
