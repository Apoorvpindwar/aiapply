"""Offline provider tests. No credentials or requests to external services."""
import sys, unittest
from pathlib import Path
from unittest.mock import patch, Mock
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'src'))
from google_api import normalize_job, search_google

class GoogleApiTest(unittest.TestCase):
    def test_normalization(self):
        job=normalize_job({'title':'Engineer','company_name':'Acme','apply_options':[{'link':'https://example.com/job'}],'detected_extensions':{'posted_at':'2 hours ago','salary':'14 LPA'}})
        self.assertEqual(job['job_url'],'https://example.com/job')
        self.assertEqual(job['salary_text'],'14 LPA')
        self.assertIsNotNone(job['date_posted'])
    def test_posted_at_falls_back_to_extensions(self):
        job=normalize_job({'title':'Engineer','extensions':['1 day ago'],'share_link':'https://example.com/job'})
        self.assertIsNotNone(job['date_posted'])
    @patch.dict('os.environ',{'SERPAPI_API_KEY':'test-only-key'})
    @patch('google_api.requests.get')
    def test_pagination(self,get):
        get.side_effect=[Mock(ok=True,json=lambda:{'jobs_results':[{'title':'A'}],'serpapi_pagination':{'next_page_token':'next'}}),Mock(ok=True,json=lambda:{'jobs_results':[{'title':'B'}]})]
        rows=search_google('engineer','India')['jobs']
        self.assertEqual(len(rows),2)
        self.assertEqual(get.call_count,2)
    @patch.dict('os.environ',{'SERPAPI_API_KEY':'test-only-key'})
    @patch('google_api.requests.get')
    def test_empty_next_page_keeps_first_page(self,get):
        get.side_effect=[
            Mock(ok=True,json=lambda:{'jobs_results':[{'title':'A'}],'serpapi_pagination':{'next_page_token':'next'}}),
            Mock(ok=True,json=lambda:{'error':"Google hasn't returned any results for this query."}),
        ]
        rows=search_google('engineer','India')['jobs']
        self.assertEqual(len(rows),1)
        self.assertEqual(rows[0]['title'],'A')
    @patch.dict('os.environ',{'SERPAPI_API_KEY':'test-only-key'})
    @patch('google_api.requests.get')
    def test_empty_first_page_is_not_an_error(self,get):
        get.return_value=Mock(ok=True,json=lambda:{'error':"Google hasn't returned any results for this query."})
        self.assertEqual(search_google('engineer','India')['jobs'],[])
    @patch.dict('os.environ',{'SERPAPI_API_KEY':'test-only-key'})
    @patch('google_api.requests.get')
    def test_error_does_not_leak_key(self,get):
        get.return_value=Mock(ok=False,status_code=401,json=lambda:{})
        with self.assertRaises(ValueError) as result:search_google('engineer','India')
        self.assertNotIn('test-only-key',str(result.exception))

if __name__=='__main__':unittest.main()
