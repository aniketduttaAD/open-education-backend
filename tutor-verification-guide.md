## Tutor Verification - Backend + Frontend Guide

### Overview
- Tutors upload 1–5 private documents (≤ 2MB each) via a single endpoint.
- Files are stored in MinIO and linked in Postgres (`files` table).
- An aggregate row per tutor is maintained in `tutor_document_sets` with JSONB array entries `{ time, file_type, file_url, file_name }`.
- Admins can view all docs and generate download URLs; only admins can verify/reject tutors.

### Storage and Schema
- MinIO bucket selection via `MinioService.getBucketForFileType`; documents bucket is used for verification docs.
- `files` table: stores uploaded files with `file_type='document'` and metadata containing `{ tutor_verification: true, document_type, description }`.
- `tutor_document_sets` (single row per `user_id`): JSONB array of document entries `{ time, file_type, file_url, file_name }`.

### Backend Endpoints

Tutor (JWT, role: tutor)
- POST `users/tutors/documents/upload`
  - multipart/form-data with `file` and fields: `file_type` (degree|certificate|id_proof|address_proof|other), `description` (optional)
  - Validations: file required, ≤ 2MB, max 5 docs total per tutor.
  - Effects: stores to MinIO and `files`, appends entry in `tutor_document_sets`.

- GET `users/tutors/documents`
  - Returns list of own verification documents (from `files`, filtered by metadata.tutor_verification=true).

- PUT `users/tutors/documents/:documentId`
  - Body: `{ description?: string, document_type?: 'degree'|'certificate'|'id_proof'|'address_proof'|'other' }`
  - Updates file metadata and the aggregate set entry’s `file_type` if provided.

- DELETE `users/tutors/documents/:documentId`
  - Allowed only if tutor is not verified.
  - Removes `files` record and prunes corresponding `tutor_document_sets.documents` entry.

- GET `users/tutors/documents/:documentId/url`
  - Returns a presigned URL if private; otherwise the file URL.

Admin (JWT, role: admin)
- GET `admin/tutors/pending-verification`
  - Lists tutors with `register_fees_paid=true` and `verification_status='pending'`.

- GET `admin/tutors/:tutorId/documents`
  - Lists all verification docs for a tutor.

- GET `admin/tutors/:tutorId/documents/:documentId/url`
  - Returns presigned URL for a specific document.

- PUT `admin/tutors/:tutorId/verify`
  - Body: `{ status: 'verified' | 'rejected', reason?: string }`
  - Updates `user.tutor_details.verification_status`.

### Frontend Implementation Checklist (Next.js + Zustand)
1) Do NOT send `register_fees_paid` or `verification_status` from FE. BE is the source of truth.
2) After payment verification, immediately refetch profile and gate UI using:
   - `user.tutor_details.register_fees_paid`
   - `user.tutor_details.verification_status`
3) Tutor onboarding flow:
   - Step 1: Profile info collection (bio, qualifications, etc.)
   - Step 2: Payment
     - Create order (orderType = `tutor_registration`) using BE-provided amount.
     - On success handler, call verify endpoint with Razorpay IDs.
     - `await fetchProfile()` and proceed only if `register_fees_paid === true`.
   - Step 3: Bank details; `saveTutorDetails` with only allowed fields (no payment flags).
4) Document management UI:
   - Upload using multipart with `file` + `file_type` + optional `description`.
   - Block upload if already 5 docs; display sizes; show error if > 2MB.
   - Provide rename/update (PUT) and delete (DELETE) actions; hide delete if verified.

### Example FE Calls (pseudo)
```ts
// Upload
const form = new FormData();
form.append('file', file);
form.append('file_type', selectedType);
if (desc) form.append('description', desc);
await api.post('/users/tutors/documents/upload', form, { headers: { 'Content-Type': 'multipart/form-data' } });

// List
const docs = await api.get('/users/tutors/documents');

// Update metadata
await api.put(`/users/tutors/documents/${id}`, { description, document_type });

// Delete
await api.delete(`/users/tutors/documents/${id}`);

// Get URL
const { url } = (await api.get(`/users/tutors/documents/${id}/url`)).data.data;
```

### Validation/Constraints
- Per-file size ≤ 2MB; max 5 verification docs per tutor; at least 1 required overall (enforced by UI/flow).
- Tutors cannot delete docs after being verified.
- Admin is the only role allowed to verify/reject tutors.

### Operational Notes
- All SQL (including `tutor_document_sets` with indexes + trigger) lives in `database/init/01-new-schema.sql`.
- Run targeted SQL in Docker Postgres for table/index/trigger creation.
- MinIO is Docker-hosted; documents bucket used; URLs are presigned for private files.


