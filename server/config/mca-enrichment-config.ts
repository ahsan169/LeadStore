export const MCA_ENRICHMENT_CONFIG = {
  scoring: {
    weights: {
      bank: 25,
      equipment: 25,
      secured_parties: 20,
      active_filings: 20,
      recency: 10,
    },
    penalties: {
      irs: 60,
      sba: 40,
    },
  },

  terms: {
    bank: [
      " bank",
      "credit union",
      " national association",
      " n.a",
      " fsb",
      "savings bank",
      "federal credit",
      "community bank",
      "wells fargo",
      "chase",
      "bank of america",
      "citibank",
      "us bank",
    ],
    equipment: [
      "john deere",
      "deere & company",
      "caterpillar",
      "cat financial",
      "dll",
      "komatsu",
      "kubota",
      "volvo financial",
      "vermeer",
      "doosan",
      "equipment finance",
      "machinery finance",
      "bobcat",
      "case",
      "new holland",
      "hitachi",
      "kobelco",
      "liebherr",
      "terex",
      "manitowoc",
      "grove",
    ],
    irs: [
      "internal revenue service",
      " irs",
      "department of revenue",
      "treasury department",
      "tax lien",
    ],
    sba: [
      "small business administration",
      "u.s. small business administration",
      "sba",
    ],
  },

  exclusions: {
    government: [
      "city and county of",
      "city of ",
      "county of ",
      "school district",
      " authority",
      "university",
      "department of",
      "state of ",
      "municipality",
      "township",
      "district court",
      "federal government",
    ],
  },

  sectors: {
    highPriority: [
      "construction",
      "paving",
      "excavation",
      "trucking",
      "utilities",
      "contractor",
      "concrete",
      "asphalt",
      "aggregate",
      "grading",
      "pipeline",
      "demolition",
      "earthmoving",
      "site work",
      "heavy civil",
    ],
  },

  dataSources: {
    colorado: {
      socrata: {
        domain: "data.colorado.gov",
        debtorDataset: "8upq-58vz",
        securedDataset: "ap62-sav4",
        collateralDataset: "4am6-w6u4",
        pageSize: 5000,
      },
    },
  },

  enrichment: {
    googlePlaces: {
      enabled: true,
      fields: [
        "name",
        "formatted_address",
        "formatted_phone_number",
        "international_phone_number",
        "website",
        "types",
        "geometry",
        "place_id",
      ],
    },
    openCorporates: {
      enabled: true,
      jurisdiction: "us_co",
    },
    fallbackChain: [
      "google_places",
      "opencorporates",
      "website_search",
    ],
  },
} as const;

export type MCAEnrichmentConfig = typeof MCA_ENRICHMENT_CONFIG;
