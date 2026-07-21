import { useEffect, useState } from "react";
import { PAGINATION } from "@/config/constants";

interface UseEntitySearchProps<T extends { search: string; page: number }> {
  params: T;
  setParams: (params: T) => void;
  debounceMe?: number;
}

export function UseEntitySearch<
  T extends {
    search: string;
    page: number;
  },
>({ params, setParams, debounceMe = 500 }: UseEntitySearchProps<T>) {
  const [localSearch, setlocalSearch] = useState(params.search);

  useEffect(() => {
    if (localSearch === "" && params.search !== "") {
      setParams({
        ...params,
        search: "",
        page: PAGINATION.DEFAULT_PAGE,
      });
      return;
    }

    const timer = setTimeout(() => {
      if (localSearch !== params.search) {
        setParams({
          ...params,
          search: localSearch,
          page: PAGINATION.DEFAULT_PAGE,
        });
      }
    }, debounceMe);

    return () => clearTimeout(timer);
  }, [localSearch, params, setParams, debounceMe]);

  useEffect(() => {
    setlocalSearch(params.search);
  }, [params.search]);

  return {
    searchValue: localSearch,
    onSearchChange: setlocalSearch,
  };
}
