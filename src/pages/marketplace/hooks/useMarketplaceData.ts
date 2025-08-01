import { useState, useEffect, useCallback, useMemo } from 'react';
import { FilterState, Screen } from '../types';
import { MarketplaceSection } from '../types/intelligent-grouping.types';
import { getActiveFilterCount } from '../types/filter.types';
import { groupingEngine } from '../services/GroupingEngine';
import MarketplaceApiService, { ScreenFilters } from '../services/api/MarketplaceApiService';
import { constants } from '../../../config/constants';

// Helper function to convert API category names to display names
const getCategoryDisplayName = (category: string): string => {
  const categoryMap: Record<string, string> = {
    'transit_buses': 'Transporte Público',
    'retail_mall': 'Centro Comercial',
    'airport': 'Aeropuerto',
    'stadium': 'Estadios',
    'highway': 'Vías Principales',
    'downtown': 'Centro de Ciudad',
    'shopping_center': 'Centro Comercial',
    'bus_station': 'Terminal de Buses',
    'train_station': 'Estación de Tren',
    'subway': 'Metro',
    'gas_station': 'Gasolinera',
    'hospital': 'Hospital',
    'university': 'Universidad',
    'school': 'Colegio',
    'office_building': 'Edificio de Oficinas',
    'residential': 'Residencial',
    'park': 'Parque',
    'beach': 'Playa',
    'tourist_area': 'Zona Turística',
    'industrial': 'Zona Industrial',
    'other': 'Otros'
  };
  
  return categoryMap[category] || category;
};

// Helper function to generate real sections from API data
const generateRealSectionsFromScreens = (screens: Screen[]): MarketplaceSection[] => {
  if (screens.length === 0) return [];

  const sections: MarketplaceSection[] = [];

  // 1. Section: Pantallas Populares (highest rated screens)
  const popularScreens = screens
    .filter(screen => screen.rating >= 4.0)
    .sort((a, b) => (b.rating || 0) - (a.rating || 0))
    .slice(0, 8);

  if (popularScreens.length > 0) {
    sections.push({
      id: 'popular-screens',
      title: 'Pantallas Populares',
      subtitle: 'Las pantallas mejor valoradas por nuestros usuarios',
      screens: popularScreens,
      displayType: 'horizontal-scroll',
      priority: 1,
      metadata: {
        algorithm: 'trending-analysis',
        confidence: 0.9,
        refreshInterval: 300000, // 5 minutes
        trackingId: `popular-${Date.now()}`,
        generatedAt: new Date()
      }
    });
  }

  // 2. Section: Por Categorías (group by categories)
  const categoriesMap = new Map<string, Screen[]>();
  screens.forEach(screen => {
    if (screen.category?.id) {
      const categoryId = screen.category.id;
      if (!categoriesMap.has(categoryId)) {
        categoriesMap.set(categoryId, []);
      }
      categoriesMap.get(categoryId)!.push(screen);
    }
  });

  // Get the category with most screens
  let largestCategory = '';
  let largestCategoryScreens: Screen[] = [];
  categoriesMap.forEach((categoryScreens, categoryId) => {
    if (categoryScreens.length > largestCategoryScreens.length) {
      largestCategory = categoryId;
      largestCategoryScreens = categoryScreens;
    }
  });

  if (largestCategoryScreens.length > 0) {
    const categoryName = largestCategoryScreens[0].category?.name || largestCategory;
    sections.push({
      id: `category-${largestCategory}`,
      title: `Mejores en ${categoryName}`,
      subtitle: `Pantallas destacadas en la categoría ${categoryName}`,
      screens: largestCategoryScreens.slice(0, 6),
      displayType: 'grid',
      priority: 2,
      metadata: {
        algorithm: 'geographic-popularity',
        confidence: 0.8,
        refreshInterval: 600000, // 10 minutes
        trackingId: `category-${largestCategory}-${Date.now()}`,
        generatedAt: new Date()
      }
    });
  }

  // 3. Section: Por Ubicación (group by city)
  const citiesMap = new Map<string, Screen[]>();
  screens.forEach(screen => {
    const locationParts = screen.location.split(',');
    const city = locationParts[locationParts.length - 1]?.trim() || 'Sin ciudad';
    if (!citiesMap.has(city)) {
      citiesMap.set(city, []);
    }
    citiesMap.get(city)!.push(screen);
  });

  // Get the city with most screens
  let largestCity = '';
  let largestCityScreens: Screen[] = [];
  citiesMap.forEach((cityScreens, city) => {
    if (cityScreens.length > largestCityScreens.length && city !== 'Sin ciudad') {
      largestCity = city;
      largestCityScreens = cityScreens;
    }
  });

  if (largestCityScreens.length > 0) {
    sections.push({
      id: `location-${largestCity.toLowerCase().replace(/\s+/g, '-')}`,
      title: `Pantallas en ${largestCity}`,
      subtitle: `Las mejores ubicaciones disponibles en ${largestCity}`,
      screens: largestCityScreens
        .sort((a, b) => (b.rating || 0) - (a.rating || 0))
        .slice(0, 8),
      displayType: 'horizontal-scroll',
      priority: 3,
      metadata: {
        algorithm: 'geographic-popularity',
        confidence: 0.85,
        refreshInterval: 600000, // 10 minutes
        trackingId: `location-${largestCity}-${Date.now()}`,
        generatedAt: new Date()
      }
    });
  }

  // 4. Section: Precios Accesibles (budget-friendly screens)
  const budgetScreens = screens
    .filter(screen => {
      const price = typeof screen.price === 'number' ? screen.price : 
                   screen.pricing?.bundles?.hourly?.price || 0;
      return price > 0 && price <= 800000; // Less than 800K COP
    })
    .sort((a, b) => {
      const priceA = typeof a.price === 'number' ? a.price : a.pricing?.bundles?.hourly?.price || 0;
      const priceB = typeof b.price === 'number' ? b.price : b.pricing?.bundles?.hourly?.price || 0;
      return priceA - priceB;
    })
    .slice(0, 6);

  if (budgetScreens.length > 0) {
    sections.push({
      id: 'budget-friendly',
      title: 'Precios Accesibles',
      subtitle: 'Pantallas de alta calidad a precios competitivos',
      screens: budgetScreens,
      displayType: 'grid',
      priority: 4,
      metadata: {
        algorithm: 'content-based',
        confidence: 0.75,
        refreshInterval: 900000, // 15 minutes
        trackingId: `budget-${Date.now()}`,
        generatedAt: new Date()
      }
    });
  }

  // 5. Section: Alto Tráfico (high traffic screens)
  const highTrafficScreens = screens
    .filter(screen => {
      const traffic = screen.views?.daily || screen.metrics?.dailyTraffic || 0;
      return traffic > 15000;
    })
    .sort((a, b) => {
      const trafficA = a.views?.daily || a.metrics?.dailyTraffic || 0;
      const trafficB = b.views?.daily || b.metrics?.dailyTraffic || 0;
      return trafficB - trafficA;
    })
    .slice(0, 6);

  if (highTrafficScreens.length > 0) {
    sections.push({
      id: 'high-traffic',
      title: 'Alto Tráfico',
      subtitle: 'Pantallas con mayor audiencia y visibilidad',
      screens: highTrafficScreens,
      displayType: 'featured',
      priority: 5,
      metadata: {
        algorithm: 'trending-analysis',
        confidence: 0.9,
        refreshInterval: 300000, // 5 minutes
        trackingId: `traffic-${Date.now()}`,
        generatedAt: new Date()
      }
    });
  }

  // 6. Section: Recién Agregadas (if we had a createdAt field, we'd use recent screens)
  // For now, we'll use a random selection as "nuevas"
  const newScreens = [...screens]
    .sort(() => Math.random() - 0.5) // Random shuffle
    .slice(0, 8);

  if (newScreens.length > 0) {
    sections.push({
      id: 'recently-added',
      title: 'Recién Agregadas',
      subtitle: 'Nuevas pantallas disponibles en nuestra plataforma',
      screens: newScreens,
      displayType: 'horizontal-scroll',
      priority: 6,
      metadata: {
        algorithm: 'new-discovery',
        confidence: 0.7,
        refreshInterval: 1800000, // 30 minutes
        trackingId: `new-${Date.now()}`,
        generatedAt: new Date()
      }
    });
  }

  return sections;
};

interface UseMarketplaceDataProps {
  initialScreens?: Screen[];
  initialFilters?: FilterState;
}

interface MarketplaceDataState {
  screens: Screen[];
  filteredScreens: Screen[];
  loading: boolean;
  error: Error | null;
  filters: FilterState;
  // Sectioned data state
  sections: MarketplaceSection[];
  sectionsLoading: boolean;
  sectionsError: string | null;
  sectionsCacheKey: string | null;
  lastSectionRefresh: Date | null;
}

export const useMarketplaceData = ({ 
  initialScreens = [], 
  initialFilters 
}: UseMarketplaceDataProps = {}) => {
  const [state, setState] = useState<MarketplaceDataState>({
    screens: initialScreens,
    filteredScreens: initialScreens,
    loading: false,
    error: null,
    filters: initialFilters || {
      search: { query: '' },
      location: { cities: [], regions: [], neighborhoods: [] },
      category: { categories: [], venueTypes: [], environments: [], dwellTimes: [] },
      price: { min: 0, max: Number.MAX_SAFE_INTEGER, ranges: [], currency: 'COP' },
      features: { allowsMoments: null, rating: null, accessibility: [], supportedFormats: [] },
      availability: { timeSlots: [], daysOfWeek: [] },
      sort: { field: 'relevance', direction: 'desc' },
      showFavoritesOnly: false,
      showCircuits: true
    },
    // Initialize sectioned data state
    sections: [],
    sectionsLoading: false,
    sectionsError: null,
    sectionsCacheKey: null,
    lastSectionRefresh: null
  });

  // Filter screens based on current filters
  const applyFilters = useCallback((screens: Screen[], filters: FilterState) => {
    let filtered = [...screens];

    // Search filter
    if (filters.search.query) {
      const query = filters.search.query.toLowerCase();
      filtered = filtered.filter(screen => 
        screen.name.toLowerCase().includes(query) ||
        screen.location.toLowerCase().includes(query) ||
        screen.category?.name?.toLowerCase().includes(query)
      );
    }

    // Location filters
    if (filters.location.cities.length > 0) {
      filtered = filtered.filter(screen =>
        filters.location.cities.some(city =>
          screen.location.toLowerCase().includes(city.toLowerCase())
        )
      );
    }

    // Category filters
    if (filters.category.categories.length > 0) {
      filtered = filtered.filter(screen =>
        filters.category.categories.includes(screen.category?.id || '')
      );
    }

    // Price filters
    if (filters.price.ranges.length > 0) {
      // This would need to be implemented based on your price range logic
      // For now, we'll keep all screens
    }

    // Feature filters
    if (filters.features.allowsMoments !== null) {
      filtered = filtered.filter(screen =>
        screen.pricing?.allowMoments === filters.features.allowsMoments
      );
    }

    if (filters.features.rating !== null) {
      filtered = filtered.filter(screen =>
        screen.rating >= (filters.features.rating || 0)
      );
    }

    // Favorites filter
    if (filters.showFavoritesOnly) {
      // This would need to integrate with your favorites service
      // For now, we'll keep all screens
    }

    // Sort results
    switch (filters.sort.field) {
      case 'price':
        filtered.sort((a, b) => {
          const priceA = a.price || 0;
          const priceB = b.price || 0;
          return filters.sort.direction === 'asc' ? priceA - priceB : priceB - priceA;
        });
        break;
      case 'rating':
        filtered.sort((a, b) => {
          return filters.sort.direction === 'asc' ? a.rating - b.rating : b.rating - a.rating;
        });
        break;
      case 'relevance':
      default:
        // Keep current order or implement relevance scoring
        break;
    }

    return filtered;
  }, []);

  // Update filtered screens when screens or filters change
  useEffect(() => {
    const filteredScreens = applyFilters(state.screens, state.filters);
    setState(prev => ({ ...prev, filteredScreens }));
  }, [state.screens, state.filters, applyFilters]);

  // Update filters
  const updateFilters = useCallback((newFilters: FilterState) => {
    setState(prev => ({ ...prev, filters: newFilters }));
  }, []);

  // Update screens
  const updateScreens = useCallback((newScreens: Screen[]) => {
    setState(prev => ({ ...prev, screens: newScreens }));
  }, []);

  // Set loading state
  const setLoading = useCallback((loading: boolean) => {
    setState(prev => ({ ...prev, loading }));
  }, []);

  // Set error state
  const setError = useCallback((error: Error | null) => {
    setState(prev => ({ ...prev, error }));
  }, []);

  // Clear filters
  const clearFilters = useCallback(() => {
    setState(prev => ({
      ...prev,
      filters: {
        search: { query: '' },
        location: { cities: [], regions: [], neighborhoods: [] },
        category: { categories: [], venueTypes: [], environments: [], dwellTimes: [] },
        price: { min: 0, max: Number.MAX_SAFE_INTEGER, ranges: [], currency: 'COP' },
        features: { allowsMoments: null, rating: null, accessibility: [], supportedFormats: [] },
        availability: { timeSlots: [], daysOfWeek: [] },
        sort: { field: 'relevance', direction: 'desc' },
        showFavoritesOnly: false,
        showCircuits: true
      }
    }));
  }, []);

  // Convert FilterState to ScreenFilters for API
  const convertFiltersToApiFormat = useCallback((filters: FilterState): ScreenFilters => {
    return {
      search: filters.search.query || undefined,
      cities: filters.location.cities.length > 0 ? filters.location.cities : undefined,
      categories: filters.category.categories.length > 0 ? filters.category.categories : undefined,
      minPrice: filters.price.min > 0 ? filters.price.min : undefined,
      maxPrice: filters.price.max < Number.MAX_SAFE_INTEGER ? filters.price.max : undefined,
      environment: filters.category.environments.length === 1 ? filters.category.environments[0] as 'indoor' | 'outdoor' : undefined,
      rating: filters.features.rating || undefined,
      allowsMoments: filters.features.allowsMoments || undefined,
      sortBy: filters.sort.field,
      sortDirection: filters.sort.direction,
    };
  }, []);

  // Fetch screens from API - Enhanced to use api/Screens/all endpoint
  const fetchScreens = useCallback(async (filters?: FilterState, page = 1, limit = 20) => {
    setLoading(true);
    setError(null);

    try {
      // Try to use the new api/Screens/all endpoint first
      try {
        const response = await fetch(`${constants.api_url}/Screens/all`);
        if (response.ok) {
          const apiScreens = await response.json();
          
          // Convert API format to Screen interface
          const convertedScreens = apiScreens.map((apiScreen: any) => {

            return {
              id: apiScreen.id.toString(), // Keep as string for consistency
              name: apiScreen.publicName || apiScreen.referenceName || `Pantalla ${apiScreen.id}`,
              location: apiScreen.address || 'Ubicación no especificada',
              coordinates: {
                lat: apiScreen.latitude || 0,
                lng: apiScreen.longitude || 0
              },
              category: {
                id: apiScreen.category || 'other',
                name: getCategoryDisplayName(apiScreen.category) || 'Otros'
              },
              specs: {
                width: apiScreen.width || 1920,
                height: apiScreen.height || 1080,
                resolution: apiScreen.resolution || 'HD',
                brightness: `${apiScreen.brightness || 5000} nits`,
                aspectRatio: '16:9',
                orientation: apiScreen.orientation || 'landscape',
                pixelDensity: 72,
                colorDepth: 24,
                refreshRate: 60
              },
              pricing: {
                minimumPrice: apiScreen.minimumPrice || 0,
                maximumPrice: apiScreen.maximumPrice || 0,
                allowMoments: apiScreen.screenPackages?.some((pkg: any) => pkg.packageType === 'moments' && pkg.enabled) || false,
                bundles: {
                  hourly: {
                    enabled: apiScreen.screenPackages?.some((pkg: any) => pkg.packageType === 'hourly' && pkg.enabled) || false,
                    price: apiScreen.screenPackages?.find((pkg: any) => pkg.packageType === 'hourly' && pkg.enabled)?.price || 0
                  },
                  daily: {
                    enabled: apiScreen.screenPackages?.some((pkg: any) => pkg.packageType === 'daily' && pkg.enabled) || false,
                    price: apiScreen.screenPackages?.find((pkg: any) => pkg.packageType === 'daily' && pkg.enabled)?.price || 0
                  },
                  weekly: {
                    enabled: apiScreen.screenPackages?.some((pkg: any) => pkg.packageType === 'weekly' && pkg.enabled) || false,
                    price: apiScreen.screenPackages?.find((pkg: any) => pkg.packageType === 'weekly' && pkg.enabled)?.price || 0
                  },
                  monthly: {
                    enabled: apiScreen.screenPackages?.some((pkg: any) => pkg.packageType === 'monthly' && pkg.enabled) || false,
                    price: apiScreen.screenPackages?.find((pkg: any) => pkg.packageType === 'monthly' && pkg.enabled)?.price || 0
                  }
                }
              },
              price: apiScreen.minimumPrice || 0, // Add price field for compatibility
              rating: apiScreen.rating || 0, // Use API rating or default to 0
              reviews: apiScreen.reviews || 0, // Use API reviews or default
              availability: apiScreen.availability !== undefined ? apiScreen.availability : false, // Use API availability or default to false
              environment: apiScreen.environment || 'indoor', // Use API environment or default
              views: {
                daily: apiScreen.estimatedDailyImpressions || 0,
                monthly: (apiScreen.estimatedDailyImpressions || 0) * 30
              },
              images: apiScreen.images?.map((img: any) => ({
                id: img.id,
                url: `https://api.shareflow.me${img.filePath}`,
                alt: img.fileName
              })) || [],
              image: apiScreen.images?.[0] ? `https://api.shareflow.me${apiScreen.images[0].filePath}` : 'https://via.placeholder.com/400x300/4F46E5/FFFFFF?text=Pantalla+Digital', // Add fallback image
              locationDetails: {
                address: apiScreen.address || '',
                city: apiScreen.address?.split(',').pop()?.trim() || 'Colombia',
                region: 'Colombia',
                country: 'Colombia',
                coordinates: {
                  lat: apiScreen.latitude || 0,
                  lng: apiScreen.longitude || 0
                },
                timezone: apiScreen.timeZone || 'America/Bogota',
                landmarks: []
              },
              metrics: {
                dailyTraffic: apiScreen.estimatedDailyImpressions || 0,
                monthlyTraffic: (apiScreen.estimatedDailyImpressions || 0) * 30,
                averageEngagement: apiScreen.averageEngagement || 0
              },
              // Operating hours from API
              operatingHours: {
                start: apiScreen.operationStartTime || '06:00',
                end: apiScreen.operationEndTime || '22:00',
                daysActive: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
              },
              // Preserve screenPackages data for price calculations
              screenPackages: apiScreen.screenPackages || []
            };
          });
          

          
          setState(prev => ({
            ...prev,
            screens: convertedScreens,
            loading: false,
            error: null,
          }));

          return {
            data: convertedScreens,
            meta: {
              total: convertedScreens.length,
              page: 1,
              limit: convertedScreens.length,
              hasMore: false,
              timestamp: new Date().toISOString(),
              requestId: `req_${Date.now()}`,
            },
            pagination: {
              currentPage: 1,
              totalPages: 1,
              pageSize: convertedScreens.length,
              totalItems: convertedScreens.length,
            },
          };
        }
      } catch (apiError) {
        // Fallback to marketplace API
      }

      // Fallback to existing marketplace API
      const apiFilters = convertFiltersToApiFormat(filters || state.filters);
      const response = await MarketplaceApiService.getScreens({
        ...apiFilters,
        page,
        limit,
      });

      setState(prev => ({
        ...prev,
        screens: response.data,
        loading: false,
        error: null,
      }));

      return response;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to fetch screens';
      setError(new Error(errorMessage));
      setLoading(false);
      throw error;
    }
  }, [state.filters, convertFiltersToApiFormat, setLoading, setError]);

  // Fetch single screen by ID
  const fetchScreen = useCallback(async (screenId: string) => {
    try {
      const screen = await MarketplaceApiService.getScreen(screenId);
      return screen;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to fetch screen';
      throw new Error(errorMessage);
    }
  }, []);

  // Search screens
  const searchScreens = useCallback(async (query: string, limit = 10) => {
    try {
      const result = await MarketplaceApiService.searchScreens(query, limit);
      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to search screens';
      throw new Error(errorMessage);
    }
  }, []);

  // Get trending screens
  const getTrendingScreens = useCallback(async (location?: string, timeframe?: number) => {
    try {
      const trendingScreens = await MarketplaceApiService.getTrendingScreens(location, timeframe);
      return trendingScreens;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to fetch trending screens';
      throw new Error(errorMessage);
    }
  }, []);

  // Get filter options
  const getFilterOptions = useCallback(async () => {
    try {
      const filterOptions = await MarketplaceApiService.getFilterOptions();
      return filterOptions;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to fetch filter options';
      throw new Error(errorMessage);
    }
  }, []);

  // Auto-fetch screens when component mounts or filters change (with debouncing)
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      if (initialScreens.length === 0 && state.screens.length === 0 && !state.loading) {
        // Only auto-fetch if no initial screens were provided and we don't have screens yet
        console.log('Auto-fetching screens from API...');
        fetchScreens().catch(error => {
          console.error('Auto-fetch screens failed:', error);
        });
      }
    }, 300); // 300ms debounce

    return () => clearTimeout(timeoutId);
  }, [state.filters, fetchScreens, initialScreens.length, state.screens.length, state.loading]);

  // Initial fetch on mount - only if no initial screens provided
  useEffect(() => {
    if (initialScreens.length === 0 && state.screens.length === 0 && !state.loading) {
      console.log('Initial fetch of screens from API...');
      fetchScreens().catch(error => {
        console.error('Initial fetch screens failed:', error);
      });
    } else if (initialScreens.length > 0) {
      // Using initial screens, skipping API fetch
    }
  }, [initialScreens.length]); // Include initialScreens.length in dependencies

  // State monitoring (removed debug logs)
  useEffect(() => {
    // Monitor state changes without logging
  }, [state.screens.length, state.filteredScreens.length, state.loading, state.error]);

  // Computed values (needed before sectioned data methods)
  const activeFilterCount = useMemo(() => getActiveFilterCount(state.filters), [state.filters]);
  const hasActiveFilters = activeFilterCount > 0;

  // Sectioned data methods
  
  // Generate cache key for sections based on user and filters
  const generateSectionsCacheKey = useCallback((userId?: string, filters?: FilterState): string => {
    const userPart = userId || 'anonymous';
    const filterPart = filters ? JSON.stringify({
      search: filters.search.query,
      location: filters.location.cities,
      category: filters.category.categories,
      features: {
        allowsMoments: filters.features.allowsMoments,
        rating: filters.features.rating
      }
    }) : '';
    return `sections_${userPart}_${btoa(filterPart).slice(0, 16)}`;
  }, []);

  // Load sections with caching and error handling
  const loadSections = useCallback(async (options: {
    userId?: string;
    location?: string;
    forceRefresh?: boolean;
    maxSections?: number;
  } = {}) => {
    const cacheKey = generateSectionsCacheKey(options.userId, state.filters);
    
    // Check if we need to refresh based on cache key or force refresh
    if (!options.forceRefresh && state.sectionsCacheKey === cacheKey && state.sections.length > 0) {
      // Check if cache is still valid (within 5 minutes for faster updates)
      const cacheAge = state.lastSectionRefresh ? Date.now() - state.lastSectionRefresh.getTime() : Infinity;
      if (cacheAge < 5 * 60 * 1000) { // 5 minutes
        return; // Use cached sections
      }
    }

    setState(prev => ({ ...prev, sectionsLoading: true, sectionsError: null }));

    try {
      // Wait for screens to be loaded if they're not available yet
      if (state.screens.length === 0 && state.loading) {
        console.log('⏳ Waiting for screens to load before generating sections...');
        setState(prev => ({ ...prev, sectionsLoading: false }));
        return;
      }

      console.log('🔄 Generating sections from real API data:', {
        availableScreens: state.screens.length,
        userId: options.userId,
        location: options.location,
        maxSections: options.maxSections
      });

      // Generate sections from real API data
      let realSections = generateRealSectionsFromScreens(state.screens);
      
      // Limit sections if maxSections is specified
      if (options.maxSections && options.maxSections > 0) {
        realSections = realSections.slice(0, options.maxSections);
      }

      // Apply current filters to sections if any are active (optimized)
      let processedSections = realSections;
      if (hasActiveFilters) {
        processedSections = applyFiltersToSections(realSections, state.filters);
      }

      console.log('✅ Generated sections from API data:', {
        totalSections: processedSections.length,
        sectionTitles: processedSections.map(s => s.title),
        totalScreensInSections: processedSections.reduce((acc, s) => acc + s.screens.length, 0)
      });

      setState(prev => ({
        ...prev,
        sections: processedSections,
        sectionsLoading: false,
        sectionsError: null,
        sectionsCacheKey: cacheKey,
        lastSectionRefresh: new Date()
      }));

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to generate sections';
      console.error('❌ Failed to load sections from API data:', error);
      
      setState(prev => ({
        ...prev,
        sectionsLoading: false,
        sectionsError: errorMessage,
        sections: [] // Clear sections on error
      }));
    }
  }, [state.filters, state.sectionsCacheKey, state.sections.length, state.lastSectionRefresh, state.screens, state.loading, hasActiveFilters, generateSectionsCacheKey]);

  // Auto-generate sections when screens are loaded from API
  useEffect(() => {
    if (state.screens.length > 0 && state.sections.length === 0 && !state.sectionsLoading) {
      console.log('🔄 Auto-generating sections because screens were loaded from API');
      loadSections({
        maxSections: 6,
        forceRefresh: false
      }).catch(error => {
        console.error('❌ Auto-generation of sections failed:', error);
      });
    }
  }, [state.screens.length, state.sections.length, state.sectionsLoading, loadSections]);

  // Apply filters to sections while maintaining section structure (optimized)
  const applyFiltersToSections = useCallback((sections: MarketplaceSection[], filters: FilterState): MarketplaceSection[] => {
    return sections.map(section => {
      let filteredScreens = [...section.screens];
      
      // Apply search filter
      if (filters.search.query) {
        const query = filters.search.query.toLowerCase();
        filteredScreens = filteredScreens.filter(screen => 
          screen.name.toLowerCase().includes(query) ||
          screen.location.toLowerCase().includes(query) ||
          screen.category?.name?.toLowerCase().includes(query)
        );
      }
      
      // Apply location filters
      if (filters.location.cities.length > 0) {
        filteredScreens = filteredScreens.filter(screen =>
          filters.location.cities.some(city =>
            screen.location.toLowerCase().includes(city.toLowerCase())
          )
        );
      }
      
      // Apply category filters
      if (filters.category.categories.length > 0) {
        filteredScreens = filteredScreens.filter(screen =>
          filters.category.categories.includes(screen.category?.id || '')
        );
      }
      
      // Apply feature filters
      if (filters.features.allowsMoments !== null) {
        filteredScreens = filteredScreens.filter(screen =>
          screen.pricing?.allowMoments === filters.features.allowsMoments
        );
      }
      
      if (filters.features.rating !== null) {
        filteredScreens = filteredScreens.filter(screen =>
          screen.rating >= (filters.features.rating || 0)
        );
      }
      
      return {
        ...section,
        screens: filteredScreens
      };
    }).filter(section => section.screens.length > 0); // Remove empty sections
  }, []);

  // Refresh sections
  const refreshSections = useCallback(async (userId?: string) => {
    await loadSections({ userId, forceRefresh: true });
  }, [loadSections]);

  // Clear sections cache
  const clearSectionsCache = useCallback(() => {
    setState(prev => ({
      ...prev,
      sections: [],
      sectionsCacheKey: null,
      lastSectionRefresh: null,
      sectionsError: null
    }));
  }, []);

  // Set sections loading state
  const setSectionsLoading = useCallback((loading: boolean) => {
    setState(prev => ({ ...prev, sectionsLoading: loading }));
  }, []);

  // Set sections error state
  const setSectionsError = useCallback((error: string | null) => {
    setState(prev => ({ ...prev, sectionsError: error }));
  }, []);

  // Update sections directly (for external updates)
  const updateSections = useCallback((newSections: MarketplaceSection[]) => {
    setState(prev => ({ 
      ...prev, 
      sections: newSections,
      lastSectionRefresh: new Date()
    }));
  }, []);

  // Auto-refresh sections when filters change (with debouncing)
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      if (state.sections.length > 0) {
        // Only refresh if we already have sections loaded
        loadSections({ forceRefresh: false });
      }
    }, 500); // 500ms debounce

    return () => clearTimeout(timeoutId);
  }, [state.filters, loadSections]);

  // Computed values for sections
  const totalScreensInSections = useMemo(() => {
    return state.sections.reduce((total, section) => total + section.screens.length, 0);
  }, [state.sections]);

  const sectionsWithScreens = useMemo(() => {
    return state.sections.filter(section => section.screens.length > 0);
  }, [state.sections]);

  const isSectionsCacheValid = useMemo(() => {
    if (!state.lastSectionRefresh) return false;
    const cacheAge = Date.now() - state.lastSectionRefresh.getTime();
    return cacheAge < 30 * 60 * 1000; // 30 minutes
  }, [state.lastSectionRefresh]);

  return {
    // State
    screens: state.screens,
    filteredScreens: state.filteredScreens,
    filters: state.filters,
    loading: state.loading,
    error: state.error,
    
    // Sectioned data state
    sections: state.sections,
    sectionsLoading: state.sectionsLoading,
    sectionsError: state.sectionsError,
    sectionsCacheKey: state.sectionsCacheKey,
    lastSectionRefresh: state.lastSectionRefresh,
    
    // Computed
    activeFilterCount,
    hasActiveFilters,
    totalScreensInSections,
    sectionsWithScreens,
    isSectionsCacheValid,
    
    // Actions
    updateFilters,
    updateScreens,
    setLoading,
    setError,
    clearFilters,
    applyFilters,
    
    // API actions
    fetchScreens,
    fetchScreen,
    searchScreens,
    getTrendingScreens,
    getFilterOptions,
    
    // Sectioned data actions
    loadSections,
    refreshSections,
    clearSectionsCache,
    setSectionsLoading,
    setSectionsError,
    updateSections,
    applyFiltersToSections
  };
};