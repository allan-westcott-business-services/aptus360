--
-- PostgreSQL database dump
--

\restrict 8g0lUYfeSWc4rntpMDAdNgYFlyPjrHMf26eaDcEhriEIE7VEziNkR33xaHYnAub

-- Dumped from database version 17.6
-- Dumped by pg_dump version 17.11 (Homebrew)

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: GIS_Basemap; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."GIS_Basemap" (
    "Basemap_ID" bigint NOT NULL,
    "Project_ID" bigint NOT NULL,
    "File_Name" text,
    "Storage_Path" text,
    "Image_Url" text NOT NULL,
    "Image_Width" integer,
    "Image_Height" integer,
    "Metres_Per_Pixel" numeric,
    "Stated_Scale" text,
    "Cal_Point_A" jsonb,
    "Cal_Point_B" jsonb,
    "Cal_Distance_M" numeric,
    "Origin_X" numeric DEFAULT 0 NOT NULL,
    "Origin_Y" numeric DEFAULT 0 NOT NULL,
    "Rotation_Deg" numeric DEFAULT 0 NOT NULL,
    "Opacity" numeric DEFAULT 0.6 NOT NULL,
    "Locked" boolean DEFAULT false NOT NULL,
    "Ref_Canvas_X" numeric,
    "Ref_Canvas_Y" numeric,
    "Ref_Easting" numeric,
    "Ref_Northing" numeric,
    "Created_At" timestamp with time zone DEFAULT now() NOT NULL,
    "Updated_At" timestamp with time zone DEFAULT now() NOT NULL,
    "Source_Kind" text DEFAULT 'image'::text NOT NULL,
    "Pdf_Page" integer DEFAULT 1 NOT NULL,
    "Page_Width" numeric,
    "Page_Height" numeric,
    CONSTRAINT "GIS_Basemap_Opacity_check" CHECK ((("Opacity" >= (0)::numeric) AND ("Opacity" <= (1)::numeric))),
    CONSTRAINT "GIS_Basemap_Source_Kind_check" CHECK (("Source_Kind" = ANY (ARRAY['image'::text, 'pdf'::text])))
);


--
-- Name: COLUMN "GIS_Basemap"."Metres_Per_Pixel"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public."GIS_Basemap"."Metres_Per_Pixel" IS 'Metres per unit of the source at scale 1 — image pixels, or PDF points.';


--
-- Name: GIS_Basemap_Basemap_ID_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public."GIS_Basemap_Basemap_ID_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: GIS_Basemap_Basemap_ID_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public."GIS_Basemap_Basemap_ID_seq" OWNED BY public."GIS_Basemap"."Basemap_ID";


--
-- Name: GIS_Feature; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."GIS_Feature" (
    "Feature_ID" bigint NOT NULL,
    "Project_ID" bigint NOT NULL,
    "Layer_Key" text DEFAULT 'note'::text NOT NULL,
    "Feature_Type" text NOT NULL,
    "Geometry" jsonb NOT NULL,
    "Label" text,
    "Attributes" jsonb DEFAULT '{}'::jsonb NOT NULL,
    "Plot_ID" bigint,
    "Created_At" timestamp with time zone DEFAULT now() NOT NULL,
    "Updated_At" timestamp with time zone DEFAULT now() NOT NULL,
    "Feature_Role" text DEFAULT 'shape'::text NOT NULL,
    CONSTRAINT "GIS_Feature_Feature_Role_check" CHECK (("Feature_Role" = ANY (ARRAY['shape'::text, 'plot'::text, 'meter'::text, 'poc'::text, 'substation'::text, 'joint'::text, 'source'::text, 'spannode'::text, 'linkbox'::text, 'column'::text, 'governor'::text, 'servicevalve'::text, 'pumping'::text, 'hvtt'::text, 'reducer'::text, 'nrs'::text, 'feederpoint'::text, 'msdb'::text, 'hdcutout'::text, 'primary'::text, 'ringsub'::text, 'openpoint'::text, 'washout'::text, 'sectionmark'::text, 'textnote'::text]))),
    CONSTRAINT "GIS_Feature_Feature_Type_check" CHECK (("Feature_Type" = ANY (ARRAY['point'::text, 'line'::text, 'polygon'::text])))
);


--
-- Name: GIS_Feature_Feature_ID_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public."GIS_Feature_Feature_ID_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: GIS_Feature_Feature_ID_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public."GIS_Feature_Feature_ID_seq" OWNED BY public."GIS_Feature"."Feature_ID";


--
-- Name: GIS_Layer; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."GIS_Layer" (
    "Layer_ID" bigint NOT NULL,
    "Layer_Key" text NOT NULL,
    "Label" text NOT NULL,
    "Colour" text DEFAULT '#64748b'::text,
    "Sort_Order" integer DEFAULT 0 NOT NULL,
    "Is_Active" boolean DEFAULT true NOT NULL,
    "Utility_ID" bigint
);


--
-- Name: GIS_Layer_Layer_ID_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public."GIS_Layer_Layer_ID_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: GIS_Layer_Layer_ID_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public."GIS_Layer_Layer_ID_seq" OWNED BY public."GIS_Layer"."Layer_ID";


--
-- Name: GIS_Line_Type; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."GIS_Line_Type" (
    "Line_Type_ID" bigint NOT NULL,
    "Type_Key" text NOT NULL,
    "Label" text NOT NULL,
    "Layer_Key" text NOT NULL,
    "Colour" text DEFAULT '#64748b'::text,
    "Width_px" numeric DEFAULT 2 NOT NULL,
    "Dashed" boolean DEFAULT false NOT NULL,
    "Sort_Order" integer DEFAULT 0 NOT NULL,
    "Is_Active" boolean DEFAULT true NOT NULL
);


--
-- Name: GIS_Line_Type_Line_Type_ID_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public."GIS_Line_Type_Line_Type_ID_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: GIS_Line_Type_Line_Type_ID_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public."GIS_Line_Type_Line_Type_ID_seq" OWNED BY public."GIS_Line_Type"."Line_Type_ID";


--
-- Name: GIS_Source; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."GIS_Source" (
    "Source_ID" bigint NOT NULL,
    "Project_ID" bigint NOT NULL,
    "Feature_ID" bigint,
    "Source_Type" text DEFAULT 'Substation'::text NOT NULL,
    "Label" text,
    "Ways" integer DEFAULT 4 NOT NULL,
    "Created_At" timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT "GIS_Source_Source_Type_check" CHECK (("Source_Type" = ANY (ARRAY['Substation'::text, 'Feeder Pillar'::text, 'POC'::text, 'Existing Main'::text])))
);


--
-- Name: GIS_Source_Source_ID_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public."GIS_Source_Source_ID_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: GIS_Source_Source_ID_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public."GIS_Source_Source_ID_seq" OWNED BY public."GIS_Source"."Source_ID";


--
-- Name: GIS_Surface_Type; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."GIS_Surface_Type" (
    "GIS_Surface_Type_ID" bigint NOT NULL,
    "Surface_Key" text NOT NULL,
    "Label" text NOT NULL,
    "Reinstatement_Rate" numeric,
    "Sort_Order" integer DEFAULT 0 NOT NULL,
    "Is_Active" boolean DEFAULT true NOT NULL,
    "Dig_Factor" numeric DEFAULT 1.0 NOT NULL,
    "Reinstate_M2_Hr" numeric,
    "Reinstate_Source" text,
    "Reinstate_Sample_Size" integer,
    "Reinstate_Setup_Minutes" integer,
    CONSTRAINT surface_reinstate_positive CHECK ((("Reinstate_M2_Hr" IS NULL) OR ("Reinstate_M2_Hr" > (0)::numeric))),
    CONSTRAINT surface_reinstate_provenance CHECK ((("Reinstate_Source" IS NULL) OR ("Reinstate_M2_Hr" IS NOT NULL))),
    CONSTRAINT surface_reinstate_setup CHECK ((("Reinstate_Setup_Minutes" IS NULL) OR ("Reinstate_Setup_Minutes" >= 0))),
    CONSTRAINT surface_reinstate_source CHECK ((("Reinstate_Source" IS NULL) OR ("Reinstate_Source" = ANY (ARRAY['estimate'::text, 'measured'::text]))))
);


--
-- Name: COLUMN "GIS_Surface_Type"."Dig_Factor"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public."GIS_Surface_Type"."Dig_Factor" IS 'How much slower this surface is to dig than unmade ground, which is 1.0. Above 1 is breaking out, not making good — reinstatement is not estimated.';


--
-- Name: COLUMN "GIS_Surface_Type"."Reinstate_M2_Hr"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public."GIS_Surface_Type"."Reinstate_M2_Hr" IS 'Square metres reinstated an hour at the pace the rate tables assume. Null means nobody has set it, and the phase gets no estimate rather than a guessed one.';


--
-- Name: GIS_Surface_Type_GIS_Surface_Type_ID_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public."GIS_Surface_Type_GIS_Surface_Type_ID_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: GIS_Surface_Type_GIS_Surface_Type_ID_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public."GIS_Surface_Type_GIS_Surface_Type_ID_seq" OWNED BY public."GIS_Surface_Type"."GIS_Surface_Type_ID";


--
-- Name: GIS_Basemap Basemap_ID; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."GIS_Basemap" ALTER COLUMN "Basemap_ID" SET DEFAULT nextval('public."GIS_Basemap_Basemap_ID_seq"'::regclass);


--
-- Name: GIS_Feature Feature_ID; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."GIS_Feature" ALTER COLUMN "Feature_ID" SET DEFAULT nextval('public."GIS_Feature_Feature_ID_seq"'::regclass);


--
-- Name: GIS_Layer Layer_ID; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."GIS_Layer" ALTER COLUMN "Layer_ID" SET DEFAULT nextval('public."GIS_Layer_Layer_ID_seq"'::regclass);


--
-- Name: GIS_Line_Type Line_Type_ID; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."GIS_Line_Type" ALTER COLUMN "Line_Type_ID" SET DEFAULT nextval('public."GIS_Line_Type_Line_Type_ID_seq"'::regclass);


--
-- Name: GIS_Source Source_ID; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."GIS_Source" ALTER COLUMN "Source_ID" SET DEFAULT nextval('public."GIS_Source_Source_ID_seq"'::regclass);


--
-- Name: GIS_Surface_Type GIS_Surface_Type_ID; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."GIS_Surface_Type" ALTER COLUMN "GIS_Surface_Type_ID" SET DEFAULT nextval('public."GIS_Surface_Type_GIS_Surface_Type_ID_seq"'::regclass);


--
-- Name: GIS_Basemap GIS_Basemap_Project_ID_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."GIS_Basemap"
    ADD CONSTRAINT "GIS_Basemap_Project_ID_key" UNIQUE ("Project_ID");


--
-- Name: GIS_Basemap GIS_Basemap_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."GIS_Basemap"
    ADD CONSTRAINT "GIS_Basemap_pkey" PRIMARY KEY ("Basemap_ID");


--
-- Name: GIS_Feature GIS_Feature_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."GIS_Feature"
    ADD CONSTRAINT "GIS_Feature_pkey" PRIMARY KEY ("Feature_ID");


--
-- Name: GIS_Layer GIS_Layer_Layer_Key_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."GIS_Layer"
    ADD CONSTRAINT "GIS_Layer_Layer_Key_key" UNIQUE ("Layer_Key");


--
-- Name: GIS_Layer GIS_Layer_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."GIS_Layer"
    ADD CONSTRAINT "GIS_Layer_pkey" PRIMARY KEY ("Layer_ID");


--
-- Name: GIS_Line_Type GIS_Line_Type_Type_Key_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."GIS_Line_Type"
    ADD CONSTRAINT "GIS_Line_Type_Type_Key_key" UNIQUE ("Type_Key");


--
-- Name: GIS_Line_Type GIS_Line_Type_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."GIS_Line_Type"
    ADD CONSTRAINT "GIS_Line_Type_pkey" PRIMARY KEY ("Line_Type_ID");


--
-- Name: GIS_Source GIS_Source_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."GIS_Source"
    ADD CONSTRAINT "GIS_Source_pkey" PRIMARY KEY ("Source_ID");


--
-- Name: GIS_Surface_Type GIS_Surface_Type_Surface_Key_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."GIS_Surface_Type"
    ADD CONSTRAINT "GIS_Surface_Type_Surface_Key_key" UNIQUE ("Surface_Key");


--
-- Name: GIS_Surface_Type GIS_Surface_Type_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."GIS_Surface_Type"
    ADD CONSTRAINT "GIS_Surface_Type_pkey" PRIMARY KEY ("GIS_Surface_Type_ID");


--
-- Name: gis_feature_circuit_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX gis_feature_circuit_idx ON public."GIS_Feature" USING btree ("Project_ID", (("Attributes" ->> 'Circuit_ID'::text))) WHERE ("Feature_Role" = 'meter'::text);


--
-- Name: gis_feature_layer_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX gis_feature_layer_idx ON public."GIS_Feature" USING btree ("Project_ID", "Layer_Key");


--
-- Name: gis_feature_meter_uniq; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX gis_feature_meter_uniq ON public."GIS_Feature" USING btree ("Plot_ID", "Layer_Key") WHERE ("Feature_Role" = 'meter'::text);


--
-- Name: gis_feature_project_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX gis_feature_project_idx ON public."GIS_Feature" USING btree ("Project_ID");


--
-- Name: gis_feature_role_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX gis_feature_role_idx ON public."GIS_Feature" USING btree ("Project_ID", "Feature_Role");


--
-- Name: gis_feature_seed_uniq; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX gis_feature_seed_uniq ON public."GIS_Feature" USING btree ("Plot_ID") WHERE ("Feature_Role" = 'plot'::text);


--
-- Name: gis_feederpoint_origin_uniq; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX gis_feederpoint_origin_uniq ON public."GIS_Feature" USING btree ("Project_ID", (("Attributes" ->> 'Circuit_ID'::text))) WHERE (("Feature_Role" = 'feederpoint'::text) AND (("Attributes" ->> 'Span_Seq'::text) = '0'::text));


--
-- Name: gis_source_project_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX gis_source_project_idx ON public."GIS_Source" USING btree ("Project_ID");


--
-- Name: gis_span_origin_uniq; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX gis_span_origin_uniq ON public."GIS_Feature" USING btree ("Project_ID", (("Attributes" ->> 'Circuit_ID'::text))) WHERE (("Feature_Role" = 'spannode'::text) AND (("Attributes" ->> 'Span_Seq'::text) = '0'::text));


--
-- Name: GIS_Basemap gis_basemap_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER gis_basemap_updated_at BEFORE UPDATE ON public."GIS_Basemap" FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: GIS_Feature gis_feature_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER gis_feature_updated_at BEFORE UPDATE ON public."GIS_Feature" FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: GIS_Feature gis_length_trg; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER gis_length_trg BEFORE INSERT OR UPDATE OF "Geometry" ON public."GIS_Feature" FOR EACH ROW EXECUTE FUNCTION public.gis_set_length();


--
-- Name: GIS_Basemap GIS_Basemap_Project_ID_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."GIS_Basemap"
    ADD CONSTRAINT "GIS_Basemap_Project_ID_fkey" FOREIGN KEY ("Project_ID") REFERENCES public."Project"("Project_ID") ON DELETE CASCADE;


--
-- Name: GIS_Feature GIS_Feature_Plot_ID_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."GIS_Feature"
    ADD CONSTRAINT "GIS_Feature_Plot_ID_fkey" FOREIGN KEY ("Plot_ID") REFERENCES public."Plot"("Plot_ID") ON DELETE CASCADE;


--
-- Name: GIS_Feature GIS_Feature_Project_ID_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."GIS_Feature"
    ADD CONSTRAINT "GIS_Feature_Project_ID_fkey" FOREIGN KEY ("Project_ID") REFERENCES public."Project"("Project_ID") ON DELETE CASCADE;


--
-- Name: GIS_Layer GIS_Layer_Utility_ID_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."GIS_Layer"
    ADD CONSTRAINT "GIS_Layer_Utility_ID_fkey" FOREIGN KEY ("Utility_ID") REFERENCES public."Utility"("Utility_ID");


--
-- Name: GIS_Source GIS_Source_Feature_ID_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."GIS_Source"
    ADD CONSTRAINT "GIS_Source_Feature_ID_fkey" FOREIGN KEY ("Feature_ID") REFERENCES public."GIS_Feature"("Feature_ID") ON DELETE CASCADE;


--
-- Name: GIS_Source GIS_Source_Project_ID_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."GIS_Source"
    ADD CONSTRAINT "GIS_Source_Project_ID_fkey" FOREIGN KEY ("Project_ID") REFERENCES public."Project"("Project_ID") ON DELETE CASCADE;


--
-- Name: GIS_Basemap; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."GIS_Basemap" ENABLE ROW LEVEL SECURITY;

--
-- Name: GIS_Feature; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."GIS_Feature" ENABLE ROW LEVEL SECURITY;

--
-- Name: GIS_Layer; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."GIS_Layer" ENABLE ROW LEVEL SECURITY;

--
-- Name: GIS_Line_Type; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."GIS_Line_Type" ENABLE ROW LEVEL SECURITY;

--
-- Name: GIS_Source; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."GIS_Source" ENABLE ROW LEVEL SECURITY;

--
-- Name: GIS_Surface_Type; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."GIS_Surface_Type" ENABLE ROW LEVEL SECURITY;

--
-- PostgreSQL database dump complete
--

\unrestrict 8g0lUYfeSWc4rntpMDAdNgYFlyPjrHMf26eaDcEhriEIE7VEziNkR33xaHYnAub

