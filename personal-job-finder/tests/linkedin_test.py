import sys,unittest
from pathlib import Path
from datetime import datetime,timezone
from unittest.mock import patch,Mock
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'src'))
from linkedin import parse_cards,parse_posted,search_linkedin

class LinkedInTest(unittest.TestCase):
    def test_recent_time_class_and_minutes(self):
        html='''<div class="base-search-card"><a class="base-card__full-link" href="https://www.linkedin.com/jobs/view/123"></a><h3 class="base-search-card__title">Engineer</h3><time class="job-search-card__listdate--new" datetime="2026-09-17">1 minute ago</time></div>'''
        now=datetime(2026,9,17,12,tzinfo=timezone.utc)
        row=parse_cards(html,now)[0]
        self.assertEqual(row['date_posted'],'2026-09-17T11:59:00+00:00')
        self.assertEqual(row['datePrecision'],'minute')
        self.assertEqual(parse_posted('5 minutes ago',None,now)[0],'2026-09-17T11:55:00+00:00')
        self.assertEqual(parse_posted('today',None,now)[1],'day')
    @patch('linkedin.requests.Session')
    def test_newest_search_params(self,session):
        session.return_value.get.return_value=Mock(ok=True,text='')
        self.assertEqual(search_linkedin('engineer','India')['jobs'],[])
        params=session.return_value.get.call_args.kwargs['params']
        self.assertEqual(params['sortBy'],'DD');self.assertEqual(params['f_TPR'],'r86400')
if __name__=='__main__':unittest.main()
