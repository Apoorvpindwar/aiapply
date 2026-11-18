"""Public LinkedIn search retaining relative posting times instead of date-only JobSpy output."""
from datetime import datetime, timedelta, timezone
import re
import requests
from bs4 import BeautifulSoup


def parse_posted(label, fallback=None, now=None):
    now = now or datetime.now(timezone.utc)
    text = str(label or '').strip()
    match = re.search(r'(\d+)\s*(seconds?|minutes?|mins?|hours?|hrs?|days?|weeks?)\s+ago', text, re.I)
    if match:
        unit = match[2].lower()
        seconds = 1 if unit.startswith('sec') else 60 if unit.startswith('min') else 3600 if unit.startswith(('hour','hr')) else 86400 if unit.startswith('day') else 604800
        precision = 'minute' if seconds <= 60 else 'hour' if seconds == 3600 else 'day'
        return (now-timedelta(seconds=int(match[1])*seconds)).isoformat(), precision
    if re.search(r'just (?:now|posted)|moments? ago', text, re.I):
        return now.isoformat(), 'minute'
    if re.search(r'\b(today|yesterday)\b', text, re.I):
        day = now.replace(hour=0,minute=0,second=0,microsecond=0)
        return (day-timedelta(days=1 if 'yesterday' in text.lower() else 0)).isoformat(), 'day'
    if fallback and re.match(r'^\d{4}-\d{2}-\d{2}', str(fallback)):
        try:
            parsed = datetime.fromisoformat(str(fallback).replace('Z','+00:00'))
            return parsed.replace(tzinfo=parsed.tzinfo or timezone.utc).isoformat(), 'day' if len(str(fallback))==10 else 'time'
        except ValueError:
            pass
    return None, 'unknown'


def parse_cards(html, now=None):
    soup = BeautifulSoup(html,'html.parser')
    rows=[]
    for card in soup.select('.base-search-card'):
        link=card.select_one('a.base-card__full-link')
        title=card.select_one('.base-search-card__title')
        if not link or not title:
            continue
        time=card.select_one('time')
        raw=time.get_text(' ',strip=True) if time else ''
        date,precision=parse_posted(raw,time.get('datetime') if time else None,now)
        def text(selector):
            el=card.select_one(selector)
            return el.get_text(' ',strip=True) if el else ''
        rows.append({'site':'linkedin','title':title.get_text(' ',strip=True),'company':text('.base-search-card__subtitle'),'location':text('.job-search-card__location'),
                     'job_url':link['href'].split('?')[0],'description':'','salary_text':text('.job-search-card__salary-info'),
                     'date_posted':date,'datePrecision':precision,'posted_text':raw})
    return rows


def search_linkedin(role,location):
    session=requests.Session()
    rows={}
    for start in (0,25,50):
        response=session.get('https://www.linkedin.com/jobs-guest/jobs/api/seeMoreJobPostings/search',params={'keywords':role,'location':location,'f_TPR':'r86400','sortBy':'DD','start':start},timeout=15)
        if not response.ok:
            if rows: break
            raise ValueError(f'LinkedIn returned HTTP {response.status_code}. Use the manual browser helper.')
        cards=parse_cards(response.text)
        if not cards: break
        before=len(rows)
        for job in cards:
            if job['date_posted']:
                age=(datetime.now(timezone.utc)-datetime.fromisoformat(job['date_posted'])).total_seconds()
                if 0<=age<86400: rows[job['job_url']]=job
        if len(rows)>=25 or (len(rows)==before and start):break
    jobs=sorted(rows.values(),key=lambda j:j['date_posted'],reverse=True)[:25]
    for job in jobs:
        try:
            response=session.get(job['job_url'],timeout=3)
            if not response.ok: continue
            soup=BeautifulSoup(response.text,'html.parser')
            desc=soup.select_one('.show-more-less-html__markup')
            if desc: job['description']=desc.get_text('\n',strip=True)
        except requests.RequestException:
            pass
    return {'jobs':jobs}
