"""One bounded source query, or local document text extraction. JSON via stdin/stdout."""
import sys, json, io, base64, contextlib, os

def main():
    data = json.load(sys.stdin)
    if data.get('action') == 'resume':
        raw = base64.b64decode(data['data'], validate=True)
        if len(raw) > 8_000_000:
            raise ValueError('Resume must be under 8 MB')
        if data['extension'] == 'pdf':
            from pypdf import PdfReader
            text = '\n'.join(p.extract_text() or '' for p in PdfReader(io.BytesIO(raw)).pages)
        elif data['extension'] == 'docx':
            from docx import Document
            doc = Document(io.BytesIO(raw))
            text = '\n'.join([p.text for p in doc.paragraphs] + [c.text for t in doc.tables for r in t.rows for c in r.cells])
        else:
            text = raw.decode('utf-8-sig')
        if len(text.strip()) < 30:
            raise ValueError('No usable text found. Paste resume text; scanned PDFs need OCR first.')
        return {'text': text[:150000]}
    if data['source'] == 'linkedin':
        from linkedin import search_linkedin
        return search_linkedin(data['role'], data['location'])
    if data['source'] == 'google' and os.environ.get('SERPAPI_API_KEY'):
        from google_api import search_google
        return search_google(data['role'], data['location'])
    from jobspy import scrape_jobs
    with contextlib.redirect_stdout(sys.stderr):
        jobs = scrape_jobs(site_name=[data['source']], search_term=data['role'],
            google_search_term=f"{data['role']} jobs in {data['location']} posted in the last 24 hours",
            location=data['location'], country_indeed='India', hours_old=24,
            results_wanted=25, linkedin_fetch_description=True, description_format='markdown', verbose=1)
    rows = json.loads(jobs.to_json(orient='records', date_format='iso'))
    for row in rows:
        row['datePrecision'] = 'day'
        if row.get('date_posted'):
            row['date_posted'] = row['date_posted'][:10] + 'T00:00:00+00:00'
    return {'jobs': rows}

try:
    print(json.dumps(main()))
except Exception as exc:
    print(json.dumps({'error': str(exc)}))
    sys.exit(1)
