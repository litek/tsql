# tsql

Simple wrapper for a more friendly tedious.

```typescript
import {Pool} from 'tsql'

interface User {
  id: number
  name: string
}

async function main() {
  let pool = new Pool('mssql://user:password@localhost/database')

  let params = {id: 12}
  let rows: User[] = await pool.query`SELECT * FROM users WHERE id = ${params.id}`
}

main()
```
