---
name: sql-index-guide
description: SQL Server index analysis and recommendation guide. Use when designing APIs that query the database — analyze query patterns, evaluate existing indexes, and recommend new indexes when needed.
license: MIT
metadata:
  author: techlead
  version: "1.0"
---

# SQL Server Index Guide

Analyze query patterns for an API endpoint and recommend appropriate SQL Server indexes.

---

**Input**: An API endpoint description including: table name, filter columns, sort columns, and select columns.

**Steps**

1. **Identify the query pattern**

   From the API contract / handler logic, extract:
   - **Filter columns** (WHERE clause): which columns appear in filters?
   - **Sort columns** (ORDER BY): which columns are sorted?
   - **Select columns** (SELECT): which columns are returned?
   - **Join columns** (JOIN ON): any foreign key joins?
   - **Cardinality**: estimate row volume (small <1K, medium 1K-100K, large >100K)

2. **Check existing indexes**

   Read the EF Core Configuration file for the entity to list all existing indexes:
   - `builder.HasIndex(x => x.Column)` — single column index
   - `builder.HasIndex(x => x.Column).IsUnique()` — unique index
   - `builder.HasIndex(x => new { x.Col1, x.Col2 })` — composite index

3. **Evaluate index coverage**

   For each query pattern, check:
   - Is the primary filter column indexed? (highest priority)
   - Does the ORDER BY column have an index?
   - Are there key lookups that could be eliminated with INCLUDE columns?
   - Is there a covering index opportunity?

4. **Apply SQL Server indexing rules**

   ### Rule 1: Column order in composite index matters
   ```
   Most selective filter → least selective filter → ORDER BY column
   ```
   SQL Server uses leftmost prefix matching. The first column MUST be in the WHERE clause.

   ### Rule 2: INCLUDE vs key columns
   - **Key columns**: columns in WHERE or ORDER BY
   - **INCLUDE columns**: columns only in SELECT (avoid key lookups)
   ```sql
   CREATE NONCLUSTERED INDEX IX_Table_Filter
   ON [Schema].[Table] (FilterCol1, FilterCol2)
   INCLUDE (SelectCol1, SelectCol2);
   ```

   ### Rule 3: Index naming convention
   ```
   IX_{TableName}_{Column1}[_{Column2}...]
   ```
   Use PascalCase, match C# property names.

   ### Rule 4: When NOT to add indexes
   - Table has < 1000 rows (full scan is faster)
   - Column has very low cardinality (e.g., boolean with 50/50 split)
   - Write-heavy table with rare reads
   - Too many indexes on same table (> 8-10 indexes slow down writes)

   ### Rule 5: Soft delete filter
   If entity uses `IsDeleted` (most entities do), include `IsDeleted` in composite indexes:
   ```sql
   CREATE NONCLUSTERED INDEX IX_Table_Status_IsDeleted
   ON [Schema].[Table] (Status, IsDeleted)
   INCLUDE (...);
   ```

   ### Rule 6: Date range queries
   For `>=` and `<=` range filters on dates, put the date column AFTER equality filters:
   ```sql
   -- Good: equality first, range second
   IX_Table_LaborType_EffectiveFrom (LaborType, EffectiveFrom)
   
   -- Bad: range first blocks LaborType usage
   IX_Table_EffectiveFrom_LaborType (EffectiveFrom, LaborType)
   ```

   ### Rule 7: Covering index for list queries
   If an API returns a paginated list and queries are frequent:
   ```sql
   CREATE NONCLUSTERED INDEX IX_Table_Covering
   ON [Schema].[Table] (EqualityFilter1, EqualityFilter2, IsDeleted)
   INCLUDE (Col1, Col2, Col3, ...all SELECT columns);
   ```
   This eliminates key lookups entirely — best for high-traffic list endpoints.

5. **Output recommendation**

   Write the index analysis in this format for `design.md`:

   ```markdown
   ### Index Analysis cho <API endpoint>

   API nay filter theo `Col1` (bat buoc), `Col2`, `Col3` va order by `Col4 DESC`.

   **Indexes hien tai da du / chua du:**
   - `IX_Table_Col1` — [muc dich]
   - `IX_Table_Col2` — [muc dich]

   **Khuyen nghi:** [Giu nguyen / Them index moi]
   ```sql
   CREATE NONCLUSTERED INDEX IX_Table_NewIndex
   ON [Schema].[Table] (Col1, Col2)
   INCLUDE (Col3, Col4);
   ```
   > [Giai thich ly do]
   ```

**Guardrails**
- Always check existing indexes FIRST before recommending new ones
- Prefer extending existing indexes over creating new ones
- Never recommend indexes without analyzing the actual query pattern
- Use PascalCase for table/column names (matching C# entity properties)
- Use SQL Server syntax (NONCLUSTERED, NVARCHAR, UNIQUEIDENTIFIER, etc.)
- Always include `IsDeleted` consideration for soft-delete entities
