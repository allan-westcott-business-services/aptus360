# CAD Layers — the whole feature, in one piece

    supabase/migrations/0216_dxf_layer_map.sql       ← in order
    supabase/migrations/0217_dxf_layer_cable.sql
    supabase/migrations/0218_cad_layer_catalogue.sql
    src/features/gis/dxfLayerMap.js   matching and scoring
    src/features/gis/dxf.js           2D, BYLAYER, real labels, mapped layers
    src/features/gis/lineLabel.js     (unchanged; dxf.js imports it)
    src/features/gis/GISCanvasPage.jsx
    src/features/gis/FeatureEditor.jsx  External/Internal field
    src/features/admin/DxfLayersAdmin.jsx  the guided mapping form
    src/features/admin/AdminPage.jsx  src/lib/adminTables.js
    netlify/functions/admin.js
    checkdxflayers.mjs  checkdxf.mjs  HANDOVER.md

## 1. Record the CAD team's layer names

**Admin › CAD Layer Names.** One row per layer of theirs: the name, the
class it belongs to (gas, water, electric, trench), the geometry type,
and optionally its ACI colour and linetype.

Enter their schedule here once. Everything below picks from it, so no
layer name is ever typed twice.

## 2. Map geometry to those layers

**Admin › CAD Layers › New rule**, asked in your order:

1. **Class** — Gas, Water, Electric, Trench
2. **Geometry** — Line, Point, Polygon
3. **Size** — only the sizes that class has. Gas and Line shows gas
   pipe sizes; water shows water; electric shows cable types and the
   sizes that type comes in
4. **AutoCAD layer** — picked from their list, filtered to the class
   and geometry you just chose

Changing the class clears a size chosen under the old one, because
125mm gas is not 125mm water.

## 3. External or Internal

A new field on **meters** and **mains feeder cables**, in the feature
editor. A mapping rule can match it, so internal and external meters
can go to different layers. A rule asking for one siting will not match
the other, nor a feature that says nothing.

## 4. The export

Geometry is written onto its mapped layer, as a 2D polyline or point
with colour and linetype BYLAYER — so it takes the layer's properties
in AutoCAD. Labels go on the mapped text layer. Mains and service tags
now carry their size and length.

If your CAD team also want the layer name carried as data ON each
object (XDATA), rather than only as its layer, say so — that is a small
addition.

## Suite state

148 of 166 pass, the same 18 pre-existing failures. Build clean.
