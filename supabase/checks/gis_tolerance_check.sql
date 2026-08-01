/* GIS tolerance check — endpoints that fall outside the joining tolerance.

   Two lines are joined when an endpoint of one lands within CONNECT_M of
   a *vertex* of the other. Lying on a segment counts for nothing: a
   service ending part-way along a mains run is on the line and connected
   to nothing, which is invisible at any sensible zoom and shows up only
   as a meter that cannot be traced back to the substation.

   Measured in the database and returning only the failures, because
   exporting every line to measure elsewhere hits the SQL editor's row
   cap and silently drops the mains you needed to measure against.

   Two findings, needing different fixes:

     meets, not joined  — the endpoint sits on the other line but no
                          vertex is near enough. The other line needs a
                          vertex there (a tee). This is a drawing fault.

     in the split band  — the gap is between 0.25 m and 0.50 m, so
                          connectedTo treats the two as separate while
                          feeder.js (CONNECT_EPS = 0.5) treats them as
                          joined. Trench Connectivity and Build LV
                          Network will disagree with the Circuit Report
                          about these, whichever is right.

   Change p_connect / p_feeder below if the constants in the code move. */

WITH params AS (
  SELECT 0.25::float8 AS p_connect,          -- snapping.js CONNECT_M
         0.50::float8 AS p_feeder,           -- feeder.js  CONNECT_EPS
         (SELECT "Project_ID" FROM "GIS_Feature" WHERE "Feature_ID" = 203) AS pid
),
lines AS (
  SELECT f."Feature_ID" AS fid,
         COALESCE(f."Label", '') AS lab,
         f."Attributes"->>'Line_Type' AS lt,
         f."Geometry" AS g,
         jsonb_array_length(f."Geometry") AS n
  FROM "GIS_Feature" f, params
  WHERE f."Project_ID" = params.pid
    AND f."Feature_Type" = 'line'
    AND jsonb_array_length(f."Geometry") >= 2
),
pts AS (
  SELECT l.fid, i,
         (l.g->i->>0)::float8 AS x,
         (l.g->i->>1)::float8 AS y
  FROM lines l, generate_series(0, l.n - 1) AS i
),
segs AS (
  SELECT a.fid, a.x AS ax, a.y AS ay, b.x AS bx, b.y AS by
  FROM pts a JOIN pts b ON b.fid = a.fid AND b.i = a.i + 1
),
ends AS (
  SELECT p.fid, p.x, p.y
  FROM pts p JOIN lines l ON l.fid = p.fid
  WHERE p.i = 0 OR p.i = l.n - 1
),
/* Bounding boxes, so the pair comparison isn't every line against every
   other. Padded by a metre, comfortably more than any tolerance here. */
bb AS (
  SELECT fid, min(x) AS x0, max(x) AS x1, min(y) AS y0, max(y) AS y1
  FROM pts GROUP BY fid
),
cand AS (
  SELECT a.fid AS fa, b.fid AS fb
  FROM bb a JOIN bb b ON b.fid > a.fid
  WHERE a.x0 - 1 <= b.x1 AND b.x0 - 1 <= a.x1
    AND a.y0 - 1 <= b.y1 AND b.y0 - 1 <= a.y1
),
/* Both directions. connectedTo compares one line's endpoints against the
   other's vertices, so a gap one way round can still be joined the other
   — reporting it without checking both is a false positive. */
pairs AS (
  SELECT fa, fb FROM cand
  UNION ALL
  SELECT fb, fa FROM cand
),
vgap AS (
  SELECT p.fa, p.fb, min(sqrt(power(e.x - v.x, 2) + power(e.y - v.y, 2))) AS d
  FROM pairs p
  JOIN ends e ON e.fid = p.fa
  JOIN pts  v ON v.fid = p.fb
  GROUP BY p.fa, p.fb
),
pgap AS (
  SELECT p.fa, p.fb, min(dd.dist) AS d
  FROM pairs p
  JOIN ends e ON e.fid = p.fa
  JOIN segs s ON s.fid = p.fb
  CROSS JOIN LATERAL (
    SELECT greatest(0, least(1,
      CASE WHEN power(s.bx - s.ax, 2) + power(s.by - s.ay, 2) = 0 THEN 0
           ELSE ((e.x - s.ax) * (s.bx - s.ax) + (e.y - s.ay) * (s.by - s.ay))
                / (power(s.bx - s.ax, 2) + power(s.by - s.ay, 2))
      END)) AS t
  ) tt
  CROSS JOIN LATERAL (
    SELECT sqrt(power(e.x - (s.ax + tt.t * (s.bx - s.ax)), 2)
              + power(e.y - (s.ay + tt.t * (s.by - s.ay)), 2)) AS dist
  ) dd
  GROUP BY p.fa, p.fb
),
merged AS (
  SELECT least(v.fa, v.fb) AS a, greatest(v.fa, v.fb) AS b,
         min(v.d) AS vertex_gap, min(g.d) AS on_line_gap
  FROM vgap v JOIN pgap g ON g.fa = v.fa AND g.fb = v.fb
  GROUP BY 1, 2
)
SELECT
  CASE WHEN m.on_line_gap <= params.p_connect
       THEN 'meets, not joined'
       ELSE 'in the split band' END                       AS finding,
  m.a AS feature_a, la.lab AS label_a, la.lt AS type_a,
  m.b AS feature_b, lb.lab AS label_b, lb.lt AS type_b,
  round(m.vertex_gap::numeric,  4)                        AS vertex_gap_m,
  round(m.on_line_gap::numeric, 4)                        AS on_line_gap_m,
  CASE WHEN m.vertex_gap <= params.p_feeder
       THEN 'feeder joins it, trace does not'
       ELSE 'both miss it' END                            AS disagreement
FROM merged m
JOIN lines la ON la.fid = m.a
JOIN lines lb ON lb.fid = m.b
CROSS JOIN params
WHERE m.vertex_gap > params.p_connect                    -- not joined
  AND (m.on_line_gap <= params.p_connect                 -- but it does meet
       OR m.vertex_gap <= params.p_feeder)               -- or the two tolerances disagree
ORDER BY finding, m.vertex_gap;
