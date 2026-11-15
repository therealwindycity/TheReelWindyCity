#!/usr/bin/env python3
import argparse
import sys
from granicus_harvester import harvest_and_ingest


def main(argv=None):
    parser = argparse.ArgumentParser()
    parser.add_argument("--url", default="https://connectcheyenne.org/")
    args = parser.parse_args(argv)
    stats = harvest_and_ingest(args.url, "Connect_Cheyenne", historical=True)
    return 0 if stats["reachable"] else 1


if __name__ == "__main__":
    sys.exit(main())
