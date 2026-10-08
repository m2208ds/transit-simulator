"""GTFS Schedule ZIP -> compact simulator JSON. Python standard library only."""
import argparse
import csv
import io
import json
import math
import re
from collections import defaultdict
from pathlib import Path
from zipfile import ZipFile


def seconds(value):
    if not value:
        return None
    if not re.fullmatch(r'\d{2,}:\d{2}:\d{2}', value):
        raise ValueError(f'Invalid GTFS time: {value}')
    h, m, s = map(int, value.split(':'))
    if m >= 60 or s >= 60:
        raise ValueError(f'Invalid GTFS time: {value}')
    return h * 3600 + m * 60 + s


def convert(source):
    with ZipFile(source) as archive:
        files = {}
        for member in archive.namelist():
            if member.endswith('/'):
                continue
            name = Path(member).name
            if name in files:
                raise ValueError(f'Duplicate file: {name}')
            files[name] = member

        def rows(name, required=False):
            if name not in files:
                if required:
                    raise ValueError(f'Missing required file: {name}')
                return []
            with archive.open(files[name]) as raw:
                return list(csv.DictReader(io.TextIOWrapper(raw, encoding='utf-8-sig', newline='')))

        def unique(records, key):
            result = {}
            for row in records:
                identifier = row[key]
                if not identifier or identifier in result:
                    raise ValueError(f'Empty or duplicate {key}: {identifier}')
                result[identifier] = row
            return result

        stops = unique(rows('stops.txt', True), 'stop_id')
        routes = unique(rows('routes.txt', True), 'route_id')
        trips = unique(rows('trips.txt', True), 'trip_id')
        warnings = []
        if 'calendar.txt' not in files and 'calendar_dates.txt' not in files:
            raise ValueError('calendar.txt or calendar_dates.txt is required')
        times = defaultdict(list)
        for row in rows('stop_times.txt', True):
            if row['trip_id'] not in trips or row['stop_id'] not in stops:
                raise ValueError('stop_times references unknown trip or stop')
            times[row['trip_id']].append([row['stop_id'], int(row['stop_sequence']), seconds(row.get('arrival_time', '')), seconds(row.get('departure_time', '')), int(row.get('pickup_type') or 0), int(row.get('drop_off_type') or 0)])
        for trip_id, entries in times.items():
            entries.sort(key=lambda item: item[1])
            if len({e[1] for e in entries}) != len(entries):
                raise ValueError(f'Duplicate stop_sequence: {trip_id}')
            last = -1
            for entry in entries:
                for t in entry[2:4]:
                    if t is not None:
                        if t < last:
                            raise ValueError(f'Non-monotonic times: {trip_id}')
                        last = t
            if any(e[2] is None or e[3] is None for e in entries):
                warnings.append(f'{trip_id}: untimed stops retained as null; routing needs interpolation')
        shapes = defaultdict(list)
        for row in rows('shapes.txt'):
            shapes[row['shape_id']].append((int(row['shape_pt_sequence']), float(row['shape_pt_lon']), float(row['shape_pt_lat'])))
        output_stops = []
        for identifier, row in stops.items():
            lat = float(row['stop_lat']) if row.get('stop_lat') else None
            lon = float(row['stop_lon']) if row.get('stop_lon') else None
            if lat is not None and (not math.isfinite(lat) or not -90 <= lat <= 90):
                raise ValueError(f'Invalid latitude: {identifier}')
            if lon is not None and (not math.isfinite(lon) or not -180 <= lon <= 180):
                raise ValueError(f'Invalid longitude: {identifier}')
            output_stops.append({'id': identifier, 'name': row.get('stop_name', ''), 'lat': lat, 'lon': lon, 'zone': row.get('zone_id', ''), 'parent': row.get('parent_station', ''), 'locationType': int(row.get('location_type') or 0)})
        output_trips = []
        for identifier, row in trips.items():
            if row['route_id'] not in routes:
                raise ValueError(f'Unknown route: {identifier}')
            if not times[identifier]:
                raise ValueError(f'No stop_times: {identifier}')
            output_trips.append({'id': identifier, 'routeId': row['route_id'], 'serviceId': row['service_id'], 'shapeId': row.get('shape_id', ''), 'direction': row.get('direction_id', ''), 'stopTimes': times[identifier]})
        fares = rows('fare_attributes.txt')
        if not fares:
            warnings.append('No legacy fares; do not assume zero fare. Supply scenario fare or implement Fares v2.')
        return {'schemaVersion': 1, 'metadata': {'source': Path(source).name, 'timeUnit': 'seconds since service-day midnight', 'coordinates': 'WGS84', 'stopTimeColumns': ['stopId', 'sequence', 'arrival', 'departure', 'pickupType', 'dropOffType'], 'warnings': warnings},
                'agencies': rows('agency.txt'), 'stops': output_stops,
                'routes': [{'id': k, 'name': v.get('route_short_name') or v.get('route_long_name', ''), 'type': int(v['route_type']), 'color': v.get('route_color', '')} for k, v in routes.items()],
                'trips': output_trips, 'shapes': {k: [[lon, lat] for _, lon, lat in sorted(v)] for k, v in shapes.items()},
                'calendar': rows('calendar.txt'), 'calendarDates': rows('calendar_dates.txt'), 'fareAttributes': fares, 'fareRules': rows('fare_rules.txt'), 'frequencies': rows('frequencies.txt'), 'transfers': rows('transfers.txt')}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('input', type=Path)
    parser.add_argument('output', type=Path)
    args = parser.parse_args()
    try:
        result = convert(args.input)
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(json.dumps(result, ensure_ascii=False, separators=(',', ':'), allow_nan=False), encoding='utf-8')
        print(f"Converted {len(result['stops'])} stops, {len(result['trips'])} trips -> {args.output}")
        for warning in result['metadata']['warnings']:
            print(f'Warning: {warning}')
    except (ValueError, KeyError, OSError) as error:
        parser.exit(1, f'Conversion failed: {error}\n')


if __name__ == '__main__':
    main()
