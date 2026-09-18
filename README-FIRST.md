# One file: the company named once

    netlify/functions/portal.js

No migration.

## The duplicate name

Branch_Dropdown already contains the company — "Anwyl Homes
(Lancashire)" — because it is written for a dropdown with no other
context around it. The portal heading supplies the company itself, so
reading that column there produced "Anwyl Homes (Anwyl Homes
(Lancashire))".

The portal now reads Branch_Name, the office alone, and the heading puts
the two together: **Anwyl Homes (Lancashire)**.

The same applies to the branch headings above each group of sites,
which sit on a page that has already named the company.

## Suite state

155 of 173 pass, the same 18 pre-existing failures. Build clean.
