# Getting the plot file into Supabase

The plot file is 333,950 rows and the connections file 33,059. Neither
can go in the way the others did:

- **The Table Editor's CSV import** builds `public.legacy_plot_import`
  unquoted, Postgres folds it to lower case, and the relation is not
  found. Every table in this schema is mixed-case, so that route has
  never worked for any of them.
- **Generated INSERT statements** — how the customers, branches,
  contracts and tenders went in — would be about 80 MB for the plots.
  The SQL editor will not take that, and splitting it into 160 pastes
  is not a plan.

So this one goes in with `psql` and `\copy`, which streams the file
straight into the table. It is one command and it takes a couple of
minutes.

## 1. Get psql

Windows: install the PostgreSQL client tools from
<https://www.postgresql.org/download/windows/> — on the component list
you only need **Command Line Tools**, not the server.

macOS: `brew install libpq` then
`brew link --force libpq`.

Check it with `psql --version`.

## 2. Get the connection string

In Supabase: **Project Settings → Database → Connection string → psql**.
Copy the whole line. It looks like

    postgresql://postgres.abcdefgh:[YOUR-PASSWORD]@aws-0-eu-west-2.pooler.supabase.com:5432/postgres

Replace `[YOUR-PASSWORD]` with the database password.

Use the **session** pooler or the direct connection, not the
transaction pooler — `\copy` holds one connection for the whole load
and the transaction pooler will cut it off.

## 3. Connect

    psql "postgresql://postgres.abcdefgh:yourpassword@aws-0-eu-west-2.pooler.supabase.com:5432/postgres"

You should get a `postgres=>` prompt.

## 4. Load the file

The command is:

    \copy "Legacy_Plot_Import" (<the columns, in your CSV's order>) FROM 'C:/path/to/plots.csv' WITH (FORMAT csv, HEADER true)

**The column list has to match the order of your CSV's header row**, and
I do not know that order yet — see "What I need from you" below. With
the wrong order it either errors on a type it cannot read or, worse,
loads every value into the neighbouring column without complaint.

Then the connections file the same way into `"Legacy_Connection_Import"`.

Forward slashes work in the path on Windows too, inside the quotes.

## 5. Check it landed

    SELECT count(*) FROM "Legacy_Plot_Import";

333,950. Then run `migration_status.sql` and rows 5.1 and 5.2 will say
so.

## What I need from you

**The header row of each CSV — the first line only.** Open the file in
Notepad or a text editor and copy that one line, or run:

    Get-Content plots.csv -TotalCount 1          # Windows PowerShell
    head -1 plots.csv                            # macOS

Send me both header lines and I will give you the two `\copy` commands
with the column lists filled in, in the right order, ready to paste.

I would rather ask for one line than guess the order of forty-odd
columns. A `\copy` with the list in the wrong order puts postcodes in
the KVA column and reports success.

## Why this is worth doing before the tenders

The tender import matches a tender to the contract it became by three
routes, and the best of them reads **this file**: a plot row carrying
both a `Tender_ID` and a `Contract_ID` is the old system stating the
link outright. That route is dead until the plot file is staged.

Of the other two, one needs a `Tender_Reference` on the contract, which
77 of 1,926 rows have, and the other needs the contract to have a
customer, which 311 do not. Tansey Green failed all three, which is how
it ended up imported twice.

Loading this file first is what stops that happening 1,377 times.

## If installing psql is a problem

There is a way round it that uses only the Supabase web interface.

The Table Editor's CSV import fails on these tables because it builds
`public.legacy_plot_import` **unquoted**, Postgres folds that to lower
case, and the relation is not found — every table in this schema is
mixed-case. But that is a naming problem, not a size one: give it a
table whose name really is lower case and the import works.

So: a migration creates `legacy_plot_import` and
`legacy_connection_import` as lower-case twins, all text columns, same
column names. You import the CSVs into those through the Table Editor,
which maps columns **by header name** rather than by position — so the
header-order hazard above disappears too. Then one statement copies the
rows across into the real `"Legacy_Plot_Import"` and the twins are
dropped.

Say the word and I will write that migration.

**The catch, said plainly:** 333,950 rows is a lot to push through a
browser-based importer, and I do not know where Supabase's CSV import
gives up. It may work, it may time out, and I cannot test it from here.
psql streams the file and will not care about the size, which is why it
is the first recommendation rather than the only one.

If the browser import stalls, splitting the CSV into a few files and
importing them one after another into the same table also works — the
twin table does not care how many goes it takes.
