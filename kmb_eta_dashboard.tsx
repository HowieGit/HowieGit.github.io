import React, { useState, useEffect, useRef, useMemo } from 'react';

export default function App() {
  // Localization & Language State
  const [lang, setLang] = useState('tc'); // 'tc' for Traditional Chinese, 'en' for English
  
  // Search and Routing State
  const [searchRoute, setSearchRoute] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [activeRoute, setActiveRoute] = useState(null); // Route info (orig, dest, etc.)
  const [directions, setDirections] = useState([]); // List of directions available
  const [selectedDirection, setSelectedDirection] = useState(null); // { bound, service_type, orig, dest }
  
  // Stop sequence state
  const [stopsList, setStopsList] = useState([]); // Array of stop IDs & sequence
  const [stopDetails, setStopDetails] = useState({}); // Cache of stop details { stopId: { name_tc, name_en, lat, long } }
  const [loadingStops, setLoadingStops] = useState(false);
  
  // ETA state
  const [etaData, setEtaData] = useState([]); // Raw ETA records
  const [selectedStopId, setSelectedStopId] = useState(null);
  const [refreshTimer, setRefreshTimer] = useState(30); // 30-second refresh timer

  // Quick route recommendations
  const quickRoutes = ['1A', '2A', '101', '968', '68X', 'B1', 'E36', '978'];

  // Bilingual translation dictionary
  const t = {
    tc: {
      title: '九巴 KMB 實時到站時間 (ETA)',
      subtitle: '直連政府開源 API • 實時到站預測',
      searchPlaceholder: '輸入巴士路線 (例如 1A, 968, 68X)',
      searchBtn: '搜尋路線',
      quickSearch: '熱門搜尋',
      selectDirection: '選擇行車方向',
      to: '往',
      stopsTitle: '中途站點',
      etaTitle: '即時到站預測 (ETA)',
      upcomingBuses: '即將抵達的 3 班車',
      noEta: '暫無即時到站時間資訊。',
      min: '分鐘',
      arriving: '即將抵達',
      scheduled: '預定班次',
      normal: '實時班次',
      remarks: '備註',
      refreshIn: '秒後自動更新',
      refreshNow: '立即手動更新',
      stopCount: '個巴士站',
      routePath: '路線地圖軌跡 (GPS)',
      about: '數據來源：香港政府 DATA.GOV.HK 交通資料 API。更新頻率為每分鐘。',
      noRouteFound: '找不到此路線，請檢查輸入是否正確。',
      loadingStopsMsg: '正在下載路線站點與坐標...',
      loadingEtaMsg: '正在更新實時到站預測...',
      backToSearch: '重新搜尋',
      allStopsEta: '全線到站總覽',
      viewSingle: '單站檢視',
      viewAll: '全線檢視',
    },
    en: {
      title: 'KMB Real-time ETA Dashboard',
      subtitle: 'Direct Gov API Connection • Real-time Arrival Prediction',
      searchPlaceholder: 'Enter bus route (e.g. 1A, 968, 68X)',
      searchBtn: 'Search Route',
      quickSearch: 'Popular Routes',
      selectDirection: 'Select Direction',
      to: 'To',
      stopsTitle: 'Bus Stops',
      etaTitle: 'Arrival Prediction (ETA)',
      upcomingBuses: 'Upcoming 3 Buses',
      noEta: 'No real-time arrival schedule available.',
      min: 'min',
      arriving: 'Arriving',
      scheduled: 'Scheduled',
      normal: 'Real-time',
      remarks: 'Remarks',
      refreshIn: 'seconds to auto-refresh',
      refreshNow: 'Refresh Now',
      stopCount: 'stops',
      routePath: 'Route GPS Path Visualization',
      about: 'Data Source: HK Gov DATA.GOV.HK Transport Open API. ETA updates every minute.',
      noRouteFound: 'Route not found. Please verify the route number.',
      loadingStopsMsg: 'Loading route stops and coordinates...',
      loadingEtaMsg: 'Updating real-time arrival estimates...',
      backToSearch: 'Reset Search',
      allStopsEta: 'All Stops Overview',
      viewSingle: 'Single Stop',
      viewAll: 'Full Timeline',
    }
  };

  // Run initial setup or setup auto-refresh intervals
  useEffect(() => {
    const timer = setInterval(() => {
      setRefreshTimer((prev) => {
        if (prev <= 1) {
          fetchEtaOnly();
          return 30;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [activeRoute, selectedDirection, selectedStopId]);

  // Execute Search for Bus Route details
  const handleSearch = async (routeQuery) => {
    const cleanQuery = (routeQuery || searchRoute).trim().toUpperCase();
    if (!cleanQuery) return;

    setLoading(true);
    setError(null);
    setDirections([]);
    setSelectedDirection(null);
    setStopsList([]);
    setSelectedStopId(null);
    setEtaData([]);

    try {
      // Step 1: Query Route details from KMB API
      // KMB route endpoint: https://data.etabus.gov.hk/v1/transport/kmb/route
      // We'll fetch all variations of this route by trying both inbound and outbound
      const [outboundRes, inboundRes] = await Promise.allSettled([
        fetch(`https://data.etabus.gov.hk/v1/transport/kmb/route/${cleanQuery}/outbound/1`),
        fetch(`https://data.etabus.gov.hk/v1/transport/kmb/route/${cleanQuery}/inbound/1`)
      ]);

      const dirsFound = [];

      if (outboundRes.status === 'fulfilled' && outboundRes.value.ok) {
        const outData = await outboundRes.value.json();
        if (outData.data && Object.keys(outData.data).length > 0) {
          dirsFound.push({
            bound: 'outbound',
            boundCode: 'O',
            service_type: '1',
            orig_tc: outData.data.orig_tc,
            orig_en: outData.data.orig_en,
            dest_tc: outData.data.dest_tc,
            dest_en: outData.data.dest_en,
          });
        }
      }

      if (inboundRes.status === 'fulfilled' && inboundRes.value.ok) {
        const inData = await inboundRes.value.json();
        if (inData.data && Object.keys(inData.data).length > 0) {
          dirsFound.push({
            bound: 'inbound',
            boundCode: 'I',
            service_type: '1',
            orig_tc: inData.data.orig_tc,
            orig_en: inData.data.orig_en,
            dest_tc: inData.data.dest_tc,
            dest_en: inData.data.dest_en,
          });
        }
      }

      if (dirsFound.length === 0) {
        // Fallback or Try search by fetching route-stop list to check if route exists
        const altRes = await fetch(`https://data.etabus.gov.hk/v1/transport/kmb/route-stop/${cleanQuery}/outbound/1`);
        if (altRes.ok) {
          const altData = await altRes.json();
          if (altData.data && altData.data.length > 0) {
            dirsFound.push({
              bound: 'outbound',
              boundCode: 'O',
              service_type: '1',
              orig_tc: '香港',
              orig_en: 'Hong Kong',
              dest_tc: '目的地',
              dest_en: 'Destination',
            });
          }
        }
      }

      if (dirsFound.length > 0) {
        setDirections(dirsFound);
        setActiveRoute(cleanQuery);
        // Automatically select first direction
        handleDirectionSelect(cleanQuery, dirsFound[0]);
      } else {
        setError(t[lang].noRouteFound);
      }
    } catch (err) {
      console.error(err);
      setError('An error occurred while fetching route data. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // Direct Selection of a route's direction (Inbound/Outbound)
  const handleDirectionSelect = async (route, dirObj) => {
    setSelectedDirection(dirObj);
    setLoadingStops(true);
    setStopsList([]);
    setSelectedStopId(null);
    setRefreshTimer(30);

    try {
      // Fetch Stops for Route
      const routeStopRes = await fetch(`https://data.etabus.gov.hk/v1/transport/kmb/route-stop/${route}/${dirObj.bound}/${dirObj.service_type}`);
      const routeStopData = await routeStopRes.json();

      if (routeStopData.data && routeStopData.data.length > 0) {
        const sortedStops = routeStopData.data.sort((a, b) => a.seq - b.seq);
        setStopsList(sortedStops);

        // Instantly select the first stop
        if (sortedStops.length > 0) {
          setSelectedStopId(sortedStops[0].stop);
        }

        // Fetch ETA for all stops on this route
        const etaRes = await fetch(`https://data.etabus.gov.hk/v1/transport/kmb/route-eta/${route}/${dirObj.service_type}`);
        const etaJson = await etaRes.json();
        setEtaData(etaJson.data || []);

        // Load stop details (names & coordinates) in parallel batches
        fetchStopDetailsInBatches(sortedStops);
      }
    } catch (err) {
      console.error('Error fetching stop lists/ETAs:', err);
    } finally {
      setLoadingStops(false);
    }
  };

  // Batch load stop names and geographical details
  const fetchStopDetailsInBatches = async (stops) => {
    const newDetails = { ...stopDetails };
    // Identify stop IDs not yet cached in state
    const uncachedStopIds = stops
      .map(s => s.stop)
      .filter(id => !newDetails[id]);

    if (uncachedStopIds.length === 0) return;

    // Fetch stop info concurrently (chunked to prevent overwhelming browsers)
    const chunkSize = 8;
    for (let i = 0; i < uncachedStopIds.length; i += chunkSize) {
      const chunk = uncachedStopIds.slice(i, i + chunkSize);
      await Promise.allSettled(
        chunk.map(async (stopId) => {
          try {
            const stopRes = await fetch(`https://data.etabus.gov.hk/v1/transport/kmb/stop/${stopId}`);
            if (stopRes.ok) {
              const resData = await stopRes.json();
              if (resData.data) {
                newDetails[stopId] = {
                  name_tc: resData.data.name_tc,
                  name_en: resData.data.name_en,
                  lat: parseFloat(resData.data.lat),
                  long: parseFloat(resData.data.long)
                };
              }
            }
          } catch (e) {
            console.error('Failed to load stop ID', stopId, e);
          }
        })
      );
      // Progressive state update for smooth user feedback
      setStopDetails({ ...newDetails });
    }
  };

  // Fetch only ETA updates (for manual or automatic timer refreshes)
  const fetchEtaOnly = async () => {
    if (!activeRoute || !selectedDirection) return;
    try {
      const etaRes = await fetch(`https://data.etabus.gov.hk/v1/transport/kmb/route-eta/${activeRoute}/${selectedDirection.service_type}`);
      const etaJson = await etaRes.json();
      setEtaData(etaJson.data || []);
    } catch (err) {
      console.error('Error refreshing ETAs:', err);
    }
  };

  // Calculate the remaining minutes from arrival timestamp
  const calculateMinutesLeft = (etaTimeStr) => {
    if (!etaTimeStr) return null;
    const now = new Date();
    const etaTime = new Date(etaTimeStr);
    const diffMs = etaTime - now;
    const diffMins = Math.ceil(diffMs / 60000);
    return diffMins;
  };

  // Extract the list of upcoming ETAs for the currently selected stop and direction
  const selectedStopEtas = useMemo(() => {
    if (!selectedStopId || !selectedDirection || !etaData.length) return [];
    
    return etaData
      .filter(eta => 
        eta.stop === selectedStopId && 
        eta.dir === selectedDirection.boundCode && 
        parseInt(eta.service_type) === parseInt(selectedDirection.service_type)
      )
      .sort((a, b) => a.eta_seq - b.eta_seq);
  }, [selectedStopId, selectedDirection, etaData]);

  // Generate SVG coordinates path from Lat/Long to plot a geographical visual guide
  const pathCoordinates = useMemo(() => {
    const list = stopsList
      .map(s => stopDetails[s.stop])
      .filter(details => details && details.lat && details.long);
      
    if (list.length === 0) return { path: '', stops: [] };

    // Find min and max values to fit coordinates inside the box beautifully
    const lats = list.map(item => item.lat);
    const longs = list.map(item => item.long);
    const minLat = Math.min(...lats);
    const maxLat = Math.max(...lats);
    const minLong = Math.min(...longs);
    const maxLong = Math.max(...longs);

    const latRange = maxLat - minLat || 0.001;
    const longRange = maxLong - minLong || 0.001;

    // Scale to standard viewbox (300 width, 160 height)
    const scale = (item) => {
      // Flip Y axis because screen coordinates start from top-left
      const x = 20 + ((item.long - minLong) / longRange) * 260;
      const y = 140 - ((item.lat - minLat) / latRange) * 120;
      return { x, y };
    };

    const scaledPoints = list.map((item, index) => {
      const stopNode = stopsList.find(s => {
        const d = stopDetails[s.stop];
        return d && d.lat === item.lat && d.long === item.long;
      });
      return {
        ...scale(item),
        stopId: stopNode?.stop,
        name: lang === 'tc' ? item.name_tc : item.name_en
      };
    });

    // Create SVG Path string
    const pathString = scaledPoints.reduce((acc, pt, idx) => {
      return acc + (idx === 0 ? `M ${pt.x} ${pt.y}` : ` L ${pt.x} ${pt.y}`);
    }, '');

    return { path: pathString, stops: scaledPoints };
  }, [stopsList, stopDetails, lang]);

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 flex flex-col font-sans transition-all duration-300">
      
      {/* Header Bar */}
      <header className="bg-slate-800 border-b border-slate-700 sticky top-0 z-50 shadow-md">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="bg-red-600 hover:bg-red-700 text-white font-extrabold px-3 py-1.5 rounded-lg shadow-inner tracking-wider flex items-center space-x-1 cursor-pointer">
              <span className="text-lg">KMB</span>
              <span className="text-xs bg-white text-red-600 px-1 rounded font-black">九巴</span>
            </div>
            <div>
              <h1 className="text-lg md:text-xl font-bold tracking-tight">{t[lang].title}</h1>
              <p className="text-xs text-slate-400 hidden sm:block">{t[lang].subtitle}</p>
            </div>
          </div>
          
          <div className="flex items-center space-x-3">
            {/* Language Toggle Button */}
            <button
              onClick={() => setLang(lang === 'tc' ? 'en' : 'tc')}
              className="bg-slate-700 hover:bg-slate-600 text-slate-200 text-xs font-semibold px-3 py-1.5 rounded-lg border border-slate-600 transition-colors flex items-center space-x-1"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5h12M9 3v2m1.048 9.5A18.022 18.022 0 016.412 9m6.088 9h7M11 21l5-10 5 10M12.751 5C11.783 11.37 7.31 16.5 3 19" />
              </svg>
              <span>{lang === 'tc' ? 'English' : '繁體中文'}</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Content Body */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 flex flex-col lg:flex-row gap-6">
        
        {/* LEFT COLUMN: Search & Stop List Selection */}
        <section className="flex-1 lg:max-w-md flex flex-col gap-4">
          
          {/* SEARCH CARD */}
          <div className="bg-slate-800 border border-slate-700 rounded-2xl p-5 shadow-xl">
            <div className="flex items-center space-x-2 mb-3">
              <span className="p-1.5 rounded-lg bg-red-500/10 text-red-500">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z" clipRule="evenodd" />
                </svg>
              </span>
              <h2 className="text-base font-bold text-slate-200">{lang === 'tc' ? '搜尋路線' : 'Route Inquiry'}</h2>
            </div>

            <form onSubmit={(e) => { e.preventDefault(); handleSearch(); }} className="flex gap-2">
              <input
                type="text"
                value={searchRoute}
                onChange={(e) => setSearchRoute(e.target.value)}
                placeholder={t[lang].searchPlaceholder}
                className="flex-1 bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-slate-100 placeholder-slate-500 text-sm focus:outline-none focus:ring-2 focus:ring-red-500 transition-all"
              />
              <button
                type="submit"
                disabled={loading}
                className="bg-red-600 hover:bg-red-700 text-white px-5 py-3 rounded-xl font-bold text-sm shadow-md transition-all active:scale-95 flex items-center space-x-1.5 disabled:opacity-50"
              >
                {loading ? (
                  <svg className="animate-spin h-5 w-5 text-white" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                ) : (
                  <span>{t[lang].searchBtn}</span>
                )}
              </button>
            </form>

            {/* Quick search tags */}
            <div className="mt-4">
              <span className="text-xs text-slate-400 block mb-2">{t[lang].quickSearch}:</span>
              <div className="flex flex-wrap gap-1.5">
                {quickRoutes.map((route) => (
                  <button
                    key={route}
                    onClick={() => {
                      setSearchRoute(route);
                      handleSearch(route);
                    }}
                    className={`text-xs px-2.5 py-1.5 rounded-lg border transition-all ${
                      activeRoute === route
                        ? 'bg-red-600/20 border-red-500 text-red-400 font-bold'
                        : 'bg-slate-900/60 border-slate-700 hover:border-slate-600 text-slate-300'
                    }`}
                  >
                    {route}
                  </button>
                ))}
              </div>
            </div>

            {error && (
              <div className="mt-4 p-3 bg-red-500/10 border border-red-500/20 text-red-400 rounded-xl text-xs flex items-center space-x-2">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 shrink-0" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                </svg>
                <span>{error}</span>
              </div>
            )}
          </div>

          {/* DIRECTION PICKER */}
          {directions.length > 0 && (
            <div className="bg-slate-800 border border-slate-700 rounded-2xl p-5 shadow-xl">
              <h3 className="text-sm font-semibold text-slate-400 mb-3 uppercase tracking-wide">
                {t[lang].selectDirection}
              </h3>
              <div className="flex flex-col gap-2">
                {directions.map((dir, idx) => {
                  const isSelected = selectedDirection?.bound === dir.bound;
                  return (
                    <button
                      key={idx}
                      onClick={() => handleDirectionSelect(activeRoute, dir)}
                      className={`w-full p-4 rounded-xl border text-left transition-all relative overflow-hidden ${
                        isSelected
                          ? 'bg-gradient-to-r from-red-600/20 to-slate-800 border-red-500 text-red-100 shadow-md'
                          : 'bg-slate-900/40 border-slate-700 hover:border-slate-600 text-slate-300'
                      }`}
                    >
                      {/* Accent highlight strip */}
                      {isSelected && <div className="absolute left-0 top-0 bottom-0 w-1 bg-red-500"></div>}
                      <div className="flex justify-between items-center">
                        <div>
                          <span className="text-xs font-semibold text-slate-400 uppercase block mb-0.5">
                            {dir.bound === 'outbound' ? (lang === 'tc' ? '去程 Outbound' : 'Outbound') : (lang === 'tc' ? '回程 Inbound' : 'Inbound')}
                          </span>
                          <span className="text-sm font-bold block">
                            {lang === 'tc' ? dir.orig_tc : dir.orig_en}
                            <span className="mx-2 text-slate-400">➔</span>
                            {lang === 'tc' ? dir.dest_tc : dir.dest_en}
                          </span>
                        </div>
                        <div className={`p-1 rounded-full ${isSelected ? 'bg-red-500/20 text-red-400' : 'text-slate-600'}`}>
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-8.707l-3-3a1 1 0 00-1.414 1.414L10.586 9H7a1 1 0 100 2h3.586l-1.293 1.293a1 1 0 101.414 1.414l3-3a1 1 0 000-1.414z" clipRule="evenodd" />
                          </svg>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* STOPS LIST */}
          {activeRoute && selectedDirection && (
            <div className="bg-slate-800 border border-slate-700 rounded-2xl shadow-xl flex-1 flex flex-col min-h-[300px] max-h-[500px] overflow-hidden">
              <div className="p-4 border-b border-slate-700 bg-slate-800/80 backdrop-blur flex justify-between items-center">
                <div>
                  <h3 className="font-bold text-slate-200">{t[lang].stopsTitle}</h3>
                  <p className="text-xs text-slate-400">
                    {stopsList.length} {t[lang].stopCount}
                  </p>
                </div>
                {loadingStops && (
                  <span className="animate-spin text-red-500">
                    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                  </span>
                )}
              </div>

              <div className="flex-1 overflow-y-auto p-4 space-y-2">
                {stopsList.map((stopItem, index) => {
                  const details = stopDetails[stopItem.stop];
                  const isSelected = selectedStopId === stopItem.stop;
                  
                  // Extract first arrival prediction for this stop to show quick countdown badge
                  const stopEtas = etaData.filter(eta => 
                    eta.stop === stopItem.stop && 
                    eta.dir === selectedDirection.boundCode
                  ).sort((a, b) => a.eta_seq - b.eta_seq);
                  
                  const firstEtaMin = stopEtas[0] ? calculateMinutesLeft(stopEtas[0].eta) : null;

                  return (
                    <button
                      key={stopItem.stop}
                      onClick={() => setSelectedStopId(stopItem.stop)}
                      className={`w-full text-left p-3 rounded-xl border flex items-center justify-between transition-all group ${
                        isSelected
                          ? 'bg-slate-700 border-red-500 text-white shadow-md'
                          : 'bg-slate-900/30 border-slate-700/60 hover:bg-slate-700/30 text-slate-300'
                      }`}
                    >
                      <div className="flex items-center space-x-3 min-w-0">
                        {/* Sequence circle */}
                        <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                          isSelected ? 'bg-red-500 text-white' : 'bg-slate-800 text-slate-400 border border-slate-700'
                        }`}>
                          {stopItem.seq}
                        </div>
                        
                        <div className="min-w-0">
                          <p className="text-sm font-bold truncate">
                            {details ? (lang === 'tc' ? details.name_tc : details.name_en) : `Stop #${stopItem.seq}`}
                          </p>
                          <p className="text-[10px] text-slate-500 truncate uppercase">
                            ID: {stopItem.stop}
                          </p>
                        </div>
                      </div>

                      {/* Quick status indicator */}
                      <div className="shrink-0 flex items-center space-x-1.5 ml-2">
                        {firstEtaMin !== null ? (
                          <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${
                            firstEtaMin <= 3
                              ? 'bg-red-500/20 text-red-400 border border-red-500/30 animate-pulse'
                              : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                          }`}>
                            {firstEtaMin <= 0 ? (lang === 'tc' ? '到站' : 'Due') : `${firstEtaMin}${t[lang].min}`}
                          </span>
                        ) : (
                          <span className="text-[10px] text-slate-600 font-mono">--</span>
                        )}
                        
                        <svg xmlns="http://www.w3.org/2000/svg" className={`h-4 w-4 transition-transform group-hover:translate-x-0.5 ${
                          isSelected ? 'text-red-400' : 'text-slate-600'
                        }`} viewBox="0 0 20 20" fill="currentColor">
                          <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" />
                        </svg>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </section>

        {/* RIGHT COLUMN: Live ETA Display, Map representation */}
        <section className="flex-1 flex flex-col gap-4">
          
          {activeRoute && selectedDirection ? (
            <>
              {/* SELECTED STOP SUMMARY */}
              <div className="bg-slate-800 border border-slate-700 rounded-2xl p-6 shadow-xl relative overflow-hidden">
                <div className="absolute top-0 right-0 p-8 opacity-5">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-44 w-44" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>

                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-700/60 relative z-10">
                  <div>
                    <div className="flex items-center space-x-2 mb-1">
                      <span className="bg-red-600 text-white font-extrabold px-2.5 py-0.5 rounded text-sm shadow">
                        {activeRoute}
                      </span>
                      <span className="text-xs text-slate-400 uppercase tracking-widest">
                        {lang === 'tc' ? '往' : 'To'} {lang === 'tc' ? selectedDirection.dest_tc : selectedDirection.dest_en}
                      </span>
                    </div>
                    <h2 className="text-2xl font-black text-white">
                      {stopDetails[selectedStopId] ? (lang === 'tc' ? stopDetails[selectedStopId].name_tc : stopDetails[selectedStopId].name_en) : 'Loading Stop Name...'}
                    </h2>
                    <p className="text-xs text-slate-400 mt-1 flex items-center space-x-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-ping"></span>
                      <span>{t[lang].etaTitle}</span>
                    </p>
                  </div>

                  {/* Manual Refresh & Auto Countdown Widget */}
                  <div className="flex items-center space-x-3 shrink-0 self-start sm:self-center">
                    <div className="relative w-10 h-10 flex items-center justify-center">
                      {/* SVG circular progress for auto-refresh */}
                      <svg className="absolute inset-0 w-full h-full transform -rotate-90">
                        <circle cx="20" cy="20" r="16" className="stroke-slate-700 fill-none" strokeWidth="2.5" />
                        <circle
                          cx="20"
                          cy="20"
                          r="16"
                          className="stroke-red-500 fill-none transition-all duration-1000"
                          strokeWidth="2.5"
                          strokeDasharray={100}
                          strokeDashoffset={100 - (refreshTimer / 30) * 100}
                        />
                      </svg>
                      <span className="text-[11px] font-bold text-slate-300 relative z-10">{refreshTimer}s</span>
                    </div>

                    <button
                      onClick={() => {
                        fetchEtaOnly();
                        setRefreshTimer(30);
                      }}
                      className="bg-slate-700 hover:bg-slate-600 text-slate-200 p-2.5 rounded-xl border border-slate-600 hover:text-white transition-all flex items-center justify-center shadow"
                      title={t[lang].refreshNow}
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-4.5 w-4.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 1121.21 3v5H16.22" />
                      </svg>
                    </button>
                  </div>
                </div>

                {/* THE 3 LIVE ETAs CONTAINER */}
                <div className="mt-6 space-y-3 relative z-10">
                  <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">
                    {t[lang].upcomingBuses}
                  </h4>

                  {selectedStopEtas.length > 0 ? (
                    selectedStopEtas.map((eta, idx) => {
                      const minsLeft = calculateMinutesLeft(eta.eta);
                      const isScheduled = eta.rmk_tc === '預定班次' || eta.rmk_en?.includes('Scheduled');
                      
                      // Theme styles based on proximity
                      let itemStyles = 'bg-slate-900/40 border-slate-700/50';
                      let minBadgeStyles = 'text-slate-300 bg-slate-800 border-slate-700';
                      if (minsLeft !== null) {
                        if (minsLeft <= 3) {
                          itemStyles = 'bg-gradient-to-r from-red-500/10 to-slate-900 border-red-500/40 shadow';
                          minBadgeStyles = 'text-red-400 bg-red-500/20 border-red-500/30 font-black animate-pulse';
                        } else if (minsLeft <= 8) {
                          itemStyles = 'bg-gradient-to-r from-amber-500/5 to-slate-900 border-amber-500/30';
                          minBadgeStyles = 'text-amber-400 bg-amber-500/20 border-amber-500/20 font-bold';
                        } else {
                          itemStyles = 'bg-gradient-to-r from-emerald-500/5 to-slate-900 border-emerald-500/30';
                          minBadgeStyles = 'text-emerald-400 bg-emerald-500/20 border-emerald-500/20';
                        }
                      }

                      return (
                        <div
                          key={idx}
                          className={`p-4 rounded-2xl border flex items-center justify-between transition-all ${itemStyles}`}
                        >
                          <div className="flex items-center space-x-4">
                            {/* ETA Index Tag */}
                            <div className="w-8 h-8 rounded-xl bg-slate-800 border border-slate-700 flex items-center justify-center font-extrabold text-slate-300 shadow">
                              {idx + 1}
                            </div>
                            
                            <div>
                              <div className="flex items-center space-x-2">
                                <span className="text-lg font-black tracking-tight text-white">
                                  {eta.eta ? new Date(eta.eta).toLocaleTimeString(lang === 'tc' ? 'zh-HK' : 'en-US', {
                                    hour: '2-digit',
                                    minute: '2-digit',
                                    hour12: false
                                  }) : '--:--'}
                                </span>
                                <span className={`text-[10px] px-2 py-0.5 rounded-full border ${
                                  isScheduled ? 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20' : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                                }`}>
                                  {isScheduled ? t[lang].scheduled : t[lang].normal}
                                </span>
                              </div>
                              <p className="text-xs text-slate-500 mt-1">
                                {lang === 'tc' ? (eta.rmk_tc || '準時') : (eta.rmk_en || 'On time')}
                              </p>
                            </div>
                          </div>

                          {/* Large minutes remaining counter */}
                          <div className="text-right flex flex-col items-end">
                            {minsLeft !== null ? (
                              minsLeft <= 0 ? (
                                <span className="text-xl font-extrabold text-red-500 animate-bounce">
                                  {t[lang].arriving}
                                </span>
                              ) : (
                                <div className="flex items-baseline space-x-1">
                                  <span className="text-3xl font-black leading-none tracking-tighter text-white">
                                    {minsLeft}
                                  </span>
                                  <span className="text-xs text-slate-400 font-bold">{t[lang].min}</span>
                                </div>
                              )
                            ) : (
                              <span className="text-sm text-slate-500 italic">No ETA</span>
                            )}
                          </div>
                        </div>
                      );
                    })
                  ) : (
                    <div className="py-8 text-center bg-slate-900/40 rounded-2xl border border-slate-800 text-slate-500 text-sm">
                      {t[lang].noEta}
                    </div>
                  )}
                </div>
              </div>

              {/* CUSTOM SVG GEOGRAPHIC VISUAL TIMELINE */}
              {pathCoordinates.stops.length > 0 && (
                <div className="bg-slate-800 border border-slate-700 rounded-2xl p-6 shadow-xl">
                  <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wide mb-4 flex items-center space-x-2">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                    <span>{t[lang].routePath}</span>
                  </h3>

                  <div className="relative bg-slate-900 border border-slate-800/80 rounded-xl p-2 overflow-hidden flex items-center justify-center">
                    <svg
                      viewBox="0 0 300 160"
                      className="w-full h-auto max-h-[220px]"
                    >
                      {/* Grid overlay for aesthetic */}
                      <g className="stroke-slate-800/40" strokeWidth="0.5">
                        <line x1="50" y1="0" x2="50" y2="160" />
                        <line x1="100" y1="0" x2="100" y2="160" />
                        <line x1="150" y1="0" x2="150" y2="160" />
                        <line x1="200" y1="0" x2="200" y2="160" />
                        <line x1="250" y1="0" x2="250" y2="160" />
                        <line x1="0" y1="40" x2="300" y2="40" />
                        <line x1="0" y1="80" x2="300" y2="80" />
                        <line x1="0" y1="120" x2="300" y2="120" />
                      </g>

                      {/* Route connecting line */}
                      <path
                        d={pathCoordinates.path}
                        fill="none"
                        stroke="#dc2626"
                        strokeWidth="4"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        className="opacity-90"
                      />
                      
                      {/* Active points mapping */}
                      {pathCoordinates.stops.map((node, i) => {
                        const isNodeSelected = selectedStopId === node.stopId;
                        return (
                          <g
                            key={i}
                            className="cursor-pointer group"
                            onClick={() => setSelectedStopId(node.stopId)}
                          >
                            <circle
                              cx={node.x}
                              cy={node.y}
                              r={isNodeSelected ? 7 : 4}
                              className={`transition-all duration-300 ${
                                isNodeSelected
                                  ? 'fill-white stroke-red-500 stroke-[3px]'
                                  : 'fill-slate-900 stroke-slate-400 stroke-[2px] hover:stroke-white hover:fill-slate-800'
                              }`}
                            />
                            {/* Tooltip on hover */}
                            <title>{node.name}</title>
                          </g>
                        );
                      })}
                    </svg>

                    <div className="absolute bottom-2 left-2 right-2 flex justify-between text-[10px] text-slate-500 bg-slate-900/90 px-2 py-1 rounded backdrop-blur">
                      <span>📍 {lang === 'tc' ? '地圖比例依經緯度自動適配' : 'Map auto-scaled by coordinates'}</span>
                      <span className="font-bold text-red-400">{lang === 'tc' ? '可點選站點圓點' : 'Click nodes to query'}</span>
                    </div>
                  </div>
                </div>
              )}

              {/* TIMELINE VIEW (COMPREHENSIVE ALL-STOPS ETA SUMMARY) */}
              <div className="bg-slate-800 border border-slate-700 rounded-2xl p-6 shadow-xl">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wide flex items-center space-x-2">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h16" />
                    </svg>
                    <span>{t[lang].allStopsEta}</span>
                  </h3>
                  <span className="text-[10px] bg-slate-700/60 px-2 py-0.5 rounded text-slate-400">
                    {lang === 'tc' ? '即時更新' : 'Live Timeline'}
                  </span>
                </div>

                <div className="space-y-3 max-h-[300px] overflow-y-auto pr-1">
                  {stopsList.map((stopItem) => {
                    const stopDetailsItem = stopDetails[stopItem.stop];
                    const isSelected = selectedStopId === stopItem.stop;
                    
                    // Filter ETAs for this stop and order sequence
                    const stopEtas = etaData
                      .filter(eta => eta.stop === stopItem.stop && eta.dir === selectedDirection.boundCode)
                      .sort((a, b) => a.eta_seq - b.eta_seq);
                    
                    return (
                      <div
                        key={stopItem.stop}
                        onClick={() => setSelectedStopId(stopItem.stop)}
                        className={`p-2.5 rounded-xl border transition-all cursor-pointer flex items-center justify-between ${
                          isSelected
                            ? 'bg-slate-700/50 border-red-500'
                            : 'bg-slate-900/20 border-slate-700/40 hover:bg-slate-700/10'
                        }`}
                      >
                        <div className="flex items-center space-x-2.5 min-w-0">
                          <span className="text-xs text-slate-500 font-mono w-4 shrink-0">
                            {stopItem.seq}.
                          </span>
                          <span className="text-sm font-bold truncate text-slate-200">
                            {stopDetailsItem ? (lang === 'tc' ? stopDetailsItem.name_tc : stopDetailsItem.name_en) : `Stop ${stopItem.seq}`}
                          </span>
                        </div>

                        <div className="flex items-center space-x-1 shrink-0">
                          {stopEtas.slice(0, 3).map((eta, eIdx) => {
                            const rem = calculateMinutesLeft(eta.eta);
                            if (rem === null) return null;
                            return (
                              <span
                                key={eIdx}
                                className={`text-[10px] px-2 py-0.5 rounded font-mono ${
                                  eIdx === 0
                                    ? (rem <= 3 ? 'bg-red-500/20 text-red-400 font-extrabold' : 'bg-emerald-500/10 text-emerald-400')
                                    : 'bg-slate-800 text-slate-400'
                                }`}
                                title={eta.eta ? new Date(eta.eta).toLocaleTimeString() : ''}
                              >
                                {rem <= 0 ? (lang === 'tc' ? '到' : 'Due') : `${rem}m`}
                              </span>
                            );
                          })}
                          {stopEtas.length === 0 && (
                            <span className="text-[10px] text-slate-600">--</span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </>
          ) : (
            /* NO ACTIVE ROUTE PANEL (SKELETON WELCOME) */
            <div className="bg-slate-800 border border-slate-700 rounded-2xl p-8 shadow-xl text-center flex flex-col items-center justify-center min-h-[400px]">
              <div className="w-16 h-16 rounded-full bg-slate-900/60 border border-slate-700 flex items-center justify-center mb-4 text-slate-400">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
              </div>
              <h3 className="text-lg font-bold text-slate-200">
                {lang === 'tc' ? '開始您的實時巴士查詢' : 'Start Your Live Bus ETA Inquiry'}
              </h3>
              <p className="text-slate-400 text-sm max-w-sm mt-2">
                {lang === 'tc'
                  ? '請在左側輸入或選擇想查詢的巴士路線編號（例如 1A 往返尖沙咀碼頭與中秀茂坪），接著即刻為您加載最新即時班次預報！'
                  : 'Please enter a bus route number in the search bar on the left (e.g., 1A) to fetch its direction paths, stop sequences, and live-updating ETA predictions.'}
              </p>
              
              <div className="mt-6 p-4 bg-slate-900/40 border border-slate-800 rounded-xl flex items-center space-x-2 text-left max-w-md">
                <span className="p-2 rounded-lg bg-red-500/10 text-red-400">💡</span>
                <span className="text-xs text-slate-500">
                  {lang === 'tc'
                    ? '本系統不預載龐大的巴士站數據字典，而是當您點擊「搜尋路線」按鈕時才按需發起 API 呼叫，能提供最精確流暢的極致體驗。'
                    : 'To ensure fast responsiveness, this system queries government open APIs on-demand only upon route search clicks, saving data payload and browser memory.'}
                </span>
              </div>
            </div>
          )}

        </section>

      </main>

      {/* Footer Info */}
      <footer className="bg-slate-950 text-slate-500 text-xs py-6 border-t border-slate-800">
        <div className="max-w-7xl mx-auto px-4 text-center space-y-2">
          <p>{t[lang].about}</p>
          <p>&copy; 2026 KMB ETA Board. All rights reserved. Designed for commuters.</p>
        </div>
      </footer>

    </div>
  );
}