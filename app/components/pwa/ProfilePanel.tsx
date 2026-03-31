'use client';

export type PersonProfile = {
  // Contact
  phone?: string | null;
  phone_cell?: string | null;
  phone_landline?: string | null;
  email?: string | null;
  do_not_call?: boolean | null;
  // Location
  household_name?: string | null;
  address?: string | null;
  mailing_address?: string | null;
  // Personal
  contact_type?: string | null;
  gender?: string | null;
  age?: number | null;
  birth_date?: string | null;
  // Civic/Political
  party?: string | null;
  voter_status?: string | null;
  voting_frequency?: string | null;
  likelihood_to_vote?: number | null;
  // Professional
  occupation_title?: string | null;
  company_name?: string | null;
  // Company-specific
  industry?: string | null;
  domain?: string | null;
  status?: string | null;
  presence?: string | null;
  // Custom fields from tenant_people.custom_data
  custom_data?: Record<string, any> | null;
  // Notes
  notes?: string | null;
};

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div style={{
        fontSize: 10,
        fontWeight: 700,
        textTransform: 'uppercase',
        letterSpacing: '0.06em',
        opacity: 0.5,
        marginBottom: 2,
      }}>
        {label}
      </div>
      <div style={{ fontSize: 13, lineHeight: 1.5 }}>{value}</div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'grid', gap: 10 }}>
      <div style={{
        fontSize: 10,
        fontWeight: 700,
        textTransform: 'uppercase',
        letterSpacing: '0.08em',
        opacity: 0.35,
        borderBottom: '1px solid rgba(255,255,255,.06)',
        paddingBottom: 4,
      }}>
        {title}
      </div>
      {children}
    </div>
  );
}

function formatAge(age?: number | null, birth_date?: string | null): string | null {
  if (age != null) return `${age} yrs`;
  if (birth_date) {
    try {
      const d = new Date(birth_date);
      if (isNaN(+d)) return birth_date;
      const computed = Math.floor((Date.now() - +d) / (365.25 * 24 * 3600 * 1000));
      return `${computed} yrs (${d.getFullYear()})`;
    } catch {
      return birth_date;
    }
  }
  return null;
}

function formatLikelihood(val?: number | null): string | null {
  if (val == null) return null;
  if (val >= 0 && val <= 1) return `${Math.round(val * 100)}%`;
  return String(val);
}

export function ProfilePanel({ profile, loading }: { profile: PersonProfile | null; loading: boolean }) {
  if (loading) {
    return <p style={{ opacity: 0.5, fontSize: 13, margin: 0 }}>Loading…</p>;
  }
  if (!profile) return null;

  const d = profile;
  const isCompany = !!(d.industry || d.domain || d.status || d.presence) && !d.occupation_title;

  // Check if any data exists at all
  const ageStr = formatAge(d.age, d.birth_date);
  const likelihoodStr = formatLikelihood(d.likelihood_to_vote);
  const phones = [
    d.phone_cell ? `C: ${d.phone_cell}` : null,
    d.phone_landline ? `L: ${d.phone_landline}` : null,
    !d.phone_cell && !d.phone_landline && d.phone ? d.phone : null,
  ].filter(Boolean) as string[];

  const hasContact = phones.length > 0 || !!d.email;
  const hasLocation = !!(d.household_name || d.address || d.mailing_address);
  const hasPersonal = !!(d.contact_type || d.gender || ageStr);
  const hasCivic = !!(d.party || d.voter_status || d.voting_frequency || likelihoodStr);
  const hasProfessional = isCompany
    ? !!(d.industry || d.domain || d.status || d.presence)
    : !!(d.occupation_title || d.company_name);
  const customEntries = d.custom_data
    ? Object.entries(d.custom_data).filter(([, v]) => v != null && v !== '')
    : [];
  const hasCustom = customEntries.length > 0;
  const hasNotes = !!d.notes;

  const hasAny = hasContact || hasLocation || hasPersonal || hasCivic || hasProfessional || hasCustom || hasNotes;

  if (!hasAny && !d.do_not_call) {
    return <p style={{ opacity: 0.5, fontSize: 13, margin: 0 }}>No additional details on file.</p>;
  }

  return (
    <div style={{ display: 'grid', gap: 18, fontSize: 13 }}>
      {/* DO NOT CALL warning */}
      {d.do_not_call && (
        <div style={{
          padding: '10px 14px',
          borderRadius: 8,
          background: 'rgba(220,38,38,0.15)',
          border: '1px solid rgba(220,38,38,0.4)',
          color: '#f87171',
          fontWeight: 700,
          fontSize: 13,
          display: 'flex',
          alignItems: 'center',
          gap: 8,
        }}>
          ⛔ DO NOT CALL
        </div>
      )}

      {/* Location */}
      {hasLocation && (
        <Section title="Location">
          {d.household_name && <Field label="Household" value={d.household_name} />}
          {(d.address || d.mailing_address) && (
            <Field label="Address" value={(d.address || d.mailing_address)!} />
          )}
        </Section>
      )}

      {/* Contact */}
      {hasContact && (
        <Section title="Contact">
          {phones.map((ph, i) => (
            <Field key={i} label={ph.startsWith('C:') ? 'Cell' : ph.startsWith('L:') ? 'Landline' : 'Phone'} value={ph.replace(/^[CL]: /, '')} />
          ))}
          {d.email && <Field label="Email" value={d.email} />}
        </Section>
      )}

      {/* Personal */}
      {hasPersonal && (
        <Section title="Personal">
          {d.contact_type && <Field label="Type" value={d.contact_type} />}
          {d.gender && <Field label="Gender" value={d.gender} />}
          {ageStr && <Field label="Age" value={ageStr} />}
        </Section>
      )}

      {/* Civic */}
      {hasCivic && (
        <Section title="Civic">
          {d.party && <Field label="Party" value={d.party} />}
          {d.voter_status && <Field label="Voter Status" value={d.voter_status} />}
          {d.voting_frequency && <Field label="Vote Frequency" value={d.voting_frequency} />}
          {likelihoodStr && <Field label="Likelihood to Vote" value={likelihoodStr} />}
        </Section>
      )}

      {/* Professional (person) or Business (company) */}
      {hasProfessional && (
        <Section title={isCompany ? 'Business' : 'Professional'}>
          {isCompany ? (
            <>
              {d.industry && <Field label="Industry" value={d.industry} />}
              {d.domain && <Field label="Website" value={d.domain} />}
              {d.status && <Field label="Status" value={d.status} />}
              {d.presence && <Field label="Presence" value={d.presence} />}
            </>
          ) : (
            <>
              {d.occupation_title && <Field label="Title" value={d.occupation_title} />}
              {d.company_name && <Field label="Employer" value={d.company_name} />}
            </>
          )}
        </Section>
      )}

      {/* Custom Fields */}
      {hasCustom && (
        <Section title="Custom Fields">
          {customEntries.map(([key, val]) => (
            <Field
              key={key}
              label={key.replace(/_/g, ' ')}
              value={typeof val === 'object' ? JSON.stringify(val) : String(val)}
            />
          ))}
        </Section>
      )}

      {/* Notes */}
      {hasNotes && (
        <Section title="Notes">
          <div style={{ fontSize: 13, lineHeight: 1.6, opacity: 0.85, whiteSpace: 'pre-wrap' }}>
            {d.notes}
          </div>
        </Section>
      )}
    </div>
  );
}
