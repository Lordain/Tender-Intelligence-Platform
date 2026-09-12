/**
 * Minimal shape of an OCDS (Open Contracting Data Standard) 1.1 release —
 * only the fields ocds-mapper.ts actually reads. OCDS is a stable,
 * internationally documented schema (standard.open-contracting.org);
 * Mexico's official "Contrataciones Abiertas" platform publishes in it.
 * See lib/ingestion/README.md for the full picture of what's real vs. a
 * placeholder in this pipeline.
 */
export type OcdsParty = {
  id?: string;
  name?: string;
  roles?: string[];
};

export type OcdsValue = {
  amount?: number;
  currency?: string;
};

export type OcdsPeriod = {
  startDate?: string;
  endDate?: string;
};

export type OcdsDocument = {
  id?: string;
  documentType?: string;
  title?: string;
  url?: string;
};

export type OcdsItem = {
  id?: string;
  description?: string;
  classification?: { scheme?: string; id?: string; description?: string };
};

export type OcdsAward = {
  id?: string;
  date?: string;
  status?: string;
};

export type OcdsRelease = {
  ocid: string;
  id: string;
  date?: string;
  buyer?: OcdsParty;
  parties?: OcdsParty[];
  tender?: {
    id?: string;
    title?: string;
    description?: string;
    status?: string; // planning | active | complete | cancelled | unsuccessful | withdrawn
    procurementMethod?: string; // open | selective | limited | direct
    procurementMethodDetails?: string;
    mainProcurementCategory?: string; // goods | services | works
    value?: OcdsValue;
    tenderPeriod?: OcdsPeriod;
    enquiryPeriod?: OcdsPeriod;
    documents?: OcdsDocument[];
    items?: OcdsItem[];
  };
  awards?: OcdsAward[];
};

export type OcdsReleasePackage = {
  uri?: string;
  publishedDate?: string;
  releases: OcdsRelease[];
};

/**
 * Common interface every government source implements (per the platform's
 * "Source Connector" design — ComprasMXConnector, DOFConnector, SAMConnector,
 * TEDConnector, etc. all conform to this so the ingestion script and mapper
 * layer don't care which country/portal the data came from).
 */
export type SourceConnector = {
  sourceName: string;
  fetchReleases(options?: { updatedSince?: string }): Promise<OcdsRelease[]>;
};
