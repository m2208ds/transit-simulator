import tempfile
import unittest
from pathlib import Path
from zipfile import ZipFile
from tools.gtfs_to_json import convert, seconds

class ConverterTests(unittest.TestCase):
    def test_service_day_time(self):
        self.assertEqual(seconds('25:10:00'), 90600)
        self.assertIsNone(seconds(''))
        with self.assertRaises(ValueError):
            seconds('12:60:00')

    def fixture(self, root, bad=False):
        path = Path(root) / 'feed.zip'
        with ZipFile(path, 'w') as z:
            z.writestr('stops.txt', '\ufeffstop_id,stop_name,stop_lat,stop_lon\nA,駅,35,139\nB,学校,35.01,139.01\n')
            z.writestr('routes.txt', 'route_id,route_short_name,route_type\nR,01,3\n')
            z.writestr('trips.txt', 'route_id,service_id,trip_id\nR,S,T\n')
            z.writestr('calendar_dates.txt', 'service_id,date,exception_type\nS,20261008,1\n')
            stop = 'UNKNOWN' if bad else 'B'
            z.writestr('stop_times.txt', f'trip_id,stop_id,stop_sequence,arrival_time,departure_time\nT,{stop},2,25:10:00,25:10:00\nT,A,1,24:50:00,24:50:00\n')
        return path

    def test_zip_sort_unicode_and_calendar(self):
        with tempfile.TemporaryDirectory() as root:
            result = convert(self.fixture(root))
            self.assertEqual(result['stops'][0]['name'], '駅')
            self.assertEqual(result['trips'][0]['stopTimes'][0][0], 'A')
            self.assertEqual(result['trips'][0]['stopTimes'][1][2], 90600)
            self.assertEqual(len(result['calendarDates']), 1)
            self.assertTrue(result['metadata']['warnings'])

    def test_unknown_reference_rejected(self):
        with tempfile.TemporaryDirectory() as root:
            with self.assertRaises(ValueError):
                convert(self.fixture(root, bad=True))

if __name__ == '__main__':
    unittest.main()
