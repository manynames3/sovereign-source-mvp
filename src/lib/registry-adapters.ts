export interface EntityLookupInput {
  uei?: string;
  cageCode?: string;
}

export interface EntityLookupResult {
  source: "MOCK" | "SAM_GOV";
  active: boolean;
  exclusionClear: boolean;
  checkedAt: string;
  rawResultJson: Record<string, unknown>;
}

export interface SamGovAdapter {
  lookupEntity(input: EntityLookupInput): Promise<EntityLookupResult>;
}

export class MockSamGovAdapter implements SamGovAdapter {
  async lookupEntity(input: EntityLookupInput): Promise<EntityLookupResult> {
    return {
      source: "MOCK",
      active: true,
      exclusionClear: true,
      checkedAt: new Date().toISOString(),
      rawResultJson: {
        cageCode: input.cageCode,
        uei: input.uei,
        note: "Mock SAM.gov adapter result. Configure SAM_GOV_API_KEY for a future real lookup path.",
      },
    };
  }
}

export class DdtcItarAdapter {
  createManualEvidenceWorkflow() {
    return {
      status: "MANUAL_REVIEW_REQUIRED",
      message:
        "MVP requires uploaded DDTC/DECCS evidence and reviewer approval; no real-time ITAR lookup is claimed.",
    };
  }
}

export class NadcapAdapter {
  createManualScopeWorkflow() {
    return {
      status: "MANUAL_REVIEW_REQUIRED",
      message:
        "MVP stores facility/process scope evidence and expiration; future QML-assisted checks can plug in here.",
    };
  }
}

export class SprsCmmcAdapter {
  createManualEvidenceWorkflow() {
    return {
      status: "MANUAL_REVIEW_REQUIRED",
      message:
        "MVP captures CMMC UID/status evidence and requires buyer confirmation; SPRS is not modeled as a public SaaS API.",
    };
  }
}

export class IsoCertAdapter {
  createManualEvidenceWorkflow() {
    return {
      status: "MANUAL_REVIEW_REQUIRED",
      message:
        "MVP treats ISO/AS9100 as reviewer-approved evidence with certificate scope and expiration tracking.",
    };
  }
}
